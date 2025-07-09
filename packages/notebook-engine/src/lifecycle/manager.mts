import type { SessionType } from '../types/index.mjs';
import { NotebookAPI } from '../api.mjs';
import { NotebookEventBus } from '../communication/event-bus.mjs';
import { ProcessManager } from '../execution/process-manager.mjs';
import { NotebookSerializer } from '../format/serializer.mjs';

export interface NotebookLifecycleConfig {
  autoSave?: boolean;
  autoSaveInterval?: number; // ms
  maxIdleTime?: number; // ms before cleanup
  checkpointInterval?: number; // ms
}

export type NotebookState = 'creating' | 'active' | 'idle' | 'suspended' | 'terminated';

export interface NotebookLifecycle {
  sessionId: string;
  state: NotebookState;
  createdAt: number;
  lastActivity: number;
  autoSaveEnabled: boolean;
  checkpoints: string[];
}

export class NotebookLifecycleManager {
  private api: NotebookAPI;
  private eventBus: NotebookEventBus;
  private processManager: ProcessManager;
  private lifecycles: Map<string, NotebookLifecycle> = new Map();
  private config: NotebookLifecycleConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: NotebookLifecycleConfig = {}) {
    this.config = {
      autoSave: true,
      autoSaveInterval: 30000, // 30 seconds
      maxIdleTime: 300000, // 5 minutes
      checkpointInterval: 600000, // 10 minutes
      ...config
    };

    this.api = new NotebookAPI();
    this.eventBus = new NotebookEventBus();
    this.processManager = new ProcessManager();

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.eventBus.onCellExecution((event) => {
      this.updateActivity(event.sessionId);
    });

    this.eventBus.onCellUpdate((event) => {
      this.updateActivity(event.sessionId);
      this.scheduleAutoSave(event.sessionId);
    });

    this.eventBus.onSessionUpdate((event) => {
      this.updateActivity(event.sessionId);
    });
  }

  async createNotebook(sessionData: Omit<SessionType, 'id'>): Promise<string> {
    const session = this.api.createSession(sessionData);
    const sessionId = session.id;

    const lifecycle: NotebookLifecycle = {
      sessionId,
      state: 'creating',
      createdAt: Date.now(),
      lastActivity: Date.now(),
      autoSaveEnabled: this.config.autoSave || false,
      checkpoints: []
    };

    this.lifecycles.set(sessionId, lifecycle);
    
    // Transition to active state
    await this.transitionState(sessionId, 'active');
    
    this.scheduleIdleCheck(sessionId);
    if (lifecycle.autoSaveEnabled) {
      this.scheduleAutoSave(sessionId);
    }
    this.scheduleCheckpoint(sessionId);

    this.eventBus.emitSessionUpdate(sessionId, session);
    
    return sessionId;
  }

  async suspendNotebook(sessionId: string): Promise<void> {
    await this.transitionState(sessionId, 'suspended');
    
    // Kill all running processes
    this.processManager.killAll(sessionId);
    
    // Clear timers
    this.clearTimers(sessionId);
    
    // Create final checkpoint
    await this.createCheckpoint(sessionId);
  }

  async resumeNotebook(sessionId: string): Promise<void> {
    const lifecycle = this.lifecycles.get(sessionId);
    if (!lifecycle) {
      throw new Error(`No lifecycle found for session ${sessionId}`);
    }

    await this.transitionState(sessionId, 'active');
    
    this.scheduleIdleCheck(sessionId);
    if (lifecycle.autoSaveEnabled) {
      this.scheduleAutoSave(sessionId);
    }
    this.scheduleCheckpoint(sessionId);
  }

  async terminateNotebook(sessionId: string): Promise<void> {
    await this.transitionState(sessionId, 'terminated');
    
    // Kill all processes
    this.processManager.killAll(sessionId);
    
    // Final save
    await this.saveNotebook(sessionId);
    
    // Clear all timers
    this.clearTimers(sessionId);
    
    // Clean up API session
    this.api.deleteSession(sessionId);
    
    // Remove lifecycle tracking
    this.lifecycles.delete(sessionId);
  }

  private async transitionState(sessionId: string, newState: NotebookState): Promise<void> {
    const lifecycle = this.lifecycles.get(sessionId);
    if (!lifecycle) {
      throw new Error(`No lifecycle found for session ${sessionId}`);
    }

    const oldState = lifecycle.state;
    lifecycle.state = newState;
    lifecycle.lastActivity = Date.now();

    console.log(`Session ${sessionId} transitioned from ${oldState} to ${newState}`);
    
    // Emit state change event
    this.eventBus.emit({
      type: 'notebook:state:changed',
      sessionId,
      timestamp: Date.now(),
      data: {
        oldState,
        newState,
        lifecycle
      }
    });
  }

  private updateActivity(sessionId: string): void {
    const lifecycle = this.lifecycles.get(sessionId);
    if (lifecycle) {
      lifecycle.lastActivity = Date.now();
      
      // If was idle, transition back to active
      if (lifecycle.state === 'idle') {
        this.transitionState(sessionId, 'active');
      }
    }
  }

  private scheduleAutoSave(sessionId: string): void {
    if (!this.config.autoSave) return;

    const existingTimer = this.timers.get(`autosave_${sessionId}`);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      this.saveNotebook(sessionId).catch(console.error);
    }, this.config.autoSaveInterval);

    this.timers.set(`autosave_${sessionId}`, timer);
  }

  private scheduleIdleCheck(sessionId: string): void {
    const existingTimer = this.timers.get(`idle_${sessionId}`);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      const lifecycle = this.lifecycles.get(sessionId);
      if (lifecycle && lifecycle.state === 'active') {
        const timeSinceActivity = Date.now() - lifecycle.lastActivity;
        if (timeSinceActivity >= (this.config.maxIdleTime || 300000)) {
          this.transitionState(sessionId, 'idle');
        } else {
          // Reschedule check
          this.scheduleIdleCheck(sessionId);
        }
      }
    }, this.config.maxIdleTime || 300000);

    this.timers.set(`idle_${sessionId}`, timer);
  }

  private scheduleCheckpoint(sessionId: string): void {
    const timer = setTimeout(() => {
      this.createCheckpoint(sessionId).catch(console.error);
      this.scheduleCheckpoint(sessionId); // Reschedule
    }, this.config.checkpointInterval);

    this.timers.set(`checkpoint_${sessionId}`, timer);
  }

  private async saveNotebook(sessionId: string): Promise<void> {
    try {
      const session = this.api.getSessionByPath(sessionId); // This needs to be implemented properly
      if (session) {
        NotebookSerializer.toJSON(session);
        // In a real implementation, this would save to disk or database
        console.log(`Auto-saved notebook ${sessionId}`);
      }
    } catch (error) {
      console.error(`Failed to save notebook ${sessionId}:`, error);
    }
  }

  private async createCheckpoint(sessionId: string): Promise<void> {
    const lifecycle = this.lifecycles.get(sessionId);
    if (!lifecycle) return;

    const checkpointId = `checkpoint_${Date.now()}`;
    lifecycle.checkpoints.push(checkpointId);

    // Keep only last 10 checkpoints
    if (lifecycle.checkpoints.length > 10) {
      lifecycle.checkpoints = lifecycle.checkpoints.slice(-10);
    }

    console.log(`Created checkpoint ${checkpointId} for session ${sessionId}`);
  }

  private clearTimers(sessionId: string): void {
    const timerKeys = Array.from(this.timers.keys()).filter(key => key.includes(sessionId));
    timerKeys.forEach(key => {
      const timer = this.timers.get(key);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(key);
      }
    });
  }

  getNotebookState(sessionId: string): NotebookLifecycle | undefined {
    return this.lifecycles.get(sessionId);
  }

  getAllNotebooks(): NotebookLifecycle[] {
    return Array.from(this.lifecycles.values());
  }

  getEventBus(): NotebookEventBus {
    return this.eventBus;
  }
}