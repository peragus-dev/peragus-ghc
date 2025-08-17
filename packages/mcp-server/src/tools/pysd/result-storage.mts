import { SimulationResults } from "./simulation-runner.mjs";
import { createHash } from "crypto";

/**
 * Metadata for cached simulation
 */
export interface SimulationMetadata {
  modelPath: string;
  parameters?: any;
  timestamp: number;
  executionTime?: number;
  tags?: string[];
}

/**
 * Simulation record with results and metadata
 */
export interface SimulationRecord {
  key: string;
  results: SimulationResults;
  metadata: SimulationMetadata;
}

/**
 * Query parameters for historical simulations
 */
export interface HistoryQuery {
  modelPath?: string;
  startTime?: number;
  endTime?: number;
  tags?: string[];
  limit?: number;
}

/**
 * Interface for result caching and storage
 */
export interface IResultStorage {
  cacheResults(key: string, results: SimulationResults, metadata: SimulationMetadata): Promise<void>;
  getCachedResults(key: string): Promise<SimulationResults | null>;
  queryHistory(query: HistoryQuery): Promise<SimulationRecord[]>;
  clearCache(): Promise<void>;
}

/**
 * LRU Cache node
 */
class LRUNode {
  constructor(
    public key: string,
    public value: SimulationRecord,
    public prev: LRUNode | null = null,
    public next: LRUNode | null = null
  ) {}
}

/**
 * Result caching and storage implementation with LRU eviction
 */
export class ResultStorage implements IResultStorage {
  private cache: Map<string, LRUNode>;
  private history: SimulationRecord[];
  private head: LRUNode | null;
  private tail: LRUNode | null;
  private maxCacheSize: number;
  private maxHistorySize: number;

  constructor(maxCacheSize = 100, maxHistorySize = 1000) {
    this.cache = new Map();
    this.history = [];
    this.head = null;
    this.tail = null;
    this.maxCacheSize = maxCacheSize;
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Caches simulation results with metadata
   */
  async cacheResults(
    key: string, 
    results: SimulationResults, 
    metadata: SimulationMetadata
  ): Promise<void> {
    // Create record
    const record: SimulationRecord = {
      key,
      results,
      metadata: {
        ...metadata,
        timestamp: metadata.timestamp || Date.now()
      }
    };

    // Add to history
    this.history.push(record);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift(); // Remove oldest
    }

    // Update LRU cache
    if (this.cache.has(key)) {
      // Move to front
      const node = this.cache.get(key)!;
      this.removeNode(node);
      node.value = record;
      this.addToFront(node);
    } else {
      // Add new node
      const node = new LRUNode(key, record);
      this.cache.set(key, node);
      this.addToFront(node);

      // Evict if necessary
      if (this.cache.size > this.maxCacheSize) {
        this.evictLRU();
      }
    }
  }

  /**
   * Retrieves cached results
   */
  async getCachedResults(key: string): Promise<SimulationResults | null> {
    const node = this.cache.get(key);
    if (!node) {
      return null;
    }

    // Move to front (most recently used)
    this.removeNode(node);
    this.addToFront(node);

    // Check if cache is expired (24 hours)
    const age = Date.now() - node.value.metadata.timestamp;
    if (age > 24 * 60 * 60 * 1000) {
      this.cache.delete(key);
      this.removeNode(node);
      return null;
    }

    return node.value.results;
  }

  /**
   * Queries historical simulation runs
   */
  async queryHistory(query: HistoryQuery): Promise<SimulationRecord[]> {
    let results = [...this.history];

    // Filter by model path
    if (query.modelPath) {
      results = results.filter(r => r.metadata.modelPath === query.modelPath);
    }

    // Filter by time range
    if (query.startTime !== undefined) {
      results = results.filter(r => r.metadata.timestamp >= query.startTime!);
    }
    if (query.endTime !== undefined) {
      results = results.filter(r => r.metadata.timestamp <= query.endTime!);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(r => {
        if (!r.metadata.tags) return false;
        return query.tags!.every(tag => r.metadata.tags!.includes(tag));
      });
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.metadata.timestamp - a.metadata.timestamp);

    // Apply limit
    if (query.limit && query.limit > 0) {
      results = results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Clears the cache
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    this.head = null;
    this.tail = null;
  }

  /**
   * Generate cache key from parameters
   */
  static generateCacheKey(modelPath: string, parameters?: any): string {
    const hash = createHash('sha256');
    hash.update(modelPath);
    if (parameters) {
      hash.update(JSON.stringify(parameters));
    }
    return hash.digest('hex').substring(0, 16);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    historySize: number;
    maxCacheSize: number;
    maxHistorySize: number;
    hitRate?: number;
  } {
    return {
      cacheSize: this.cache.size,
      historySize: this.history.length,
      maxCacheSize: this.maxCacheSize,
      maxHistorySize: this.maxHistorySize
    };
  }

  // LRU Cache helper methods

  private addToFront(node: LRUNode): void {
    node.prev = null;
    node.next = this.head;
    
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    
    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: LRUNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
  }

  private evictLRU(): void {
    if (!this.tail) return;
    
    const key = this.tail.key;
    this.removeNode(this.tail);
    this.cache.delete(key);
  }
}

// Singleton instance
export default new ResultStorage();