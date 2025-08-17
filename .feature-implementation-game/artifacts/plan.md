# Implementation Plan: PySD Integration - Python Environment Setup

## Scope
- **In-scope**: 
  - Python virtual environment creation and management via Peragus containers
  - PySD library installation with core dependencies (pandas, numpy, xarray)
  - MCP tools for Python environment operations
  - Test notebooks demonstrating PySD functionality
  - Integration with existing notebook-engine infrastructure
  
- **Out-of-scope**: 
  - Model loading and execution (Phase 2)
  - UI components for PySD visualization
  - Production deployment optimizations

## Interfaces

### TypeScript/Node.js Interface
```typescript
interface IPythonEnvironmentManager {
  initializeEnvironment(envPath: string): Promise<void>;
  installPySDDependencies(envPath: string): Promise<void>;
  verifyPySDInstallation(envPath: string): Promise<boolean>;
  executePythonScriptInEnv(envPath: string, scriptContent: string): Promise<string>;
}
```

### MCP Tools Schema
```typescript
// MCP tool for PySD environment management
{
  name: "pysd_environment_setup",
  description: "Initialize Python environment with PySD",
  inputSchema: {
    type: "object",
    properties: {
      environment_id: { type: "string" },
      python_version: { type: "string", default: "3.8" }
    }
  }
}

// MCP tool for PySD model execution
{
  name: "pysd_run_model",
  description: "Execute PySD model in container",
  inputSchema: {
    type: "object",
    properties: {
      environment_id: { type: "string" },
      model_path: { type: "string" },
      parameters: { type: "object" }
    }
  }
}
```

## Implementation Strategy Using Peragus

### 1. Environment Setup via Peragus Containers
- Use `mcp__peragus__environment_create` to create isolated Python environment
- Configure base image with Python 3.8+ support
- Install PySD and dependencies via setup commands

### 2. File Structure
```
packages/mcp-server/src/tools/pysd/
├── environment-manager.mts       # Python environment management
├── pysd-runner.mts               # PySD model execution
├── types.mts                     # TypeScript interfaces
└── test/
    ├── environment.test.mts      # Environment setup tests
    └── pysd-integration.test.mts # PySD functionality tests
```

### 3. Requirements Management
```python
# requirements.txt
pysd==3.14.0
pandas==2.0.3
numpy==1.24.3
xarray==2023.5.0
```

## Data & Migrations
- No database migrations required
- Python environment state managed via Peragus containers
- Model files stored in project filesystem

## Observability
- **Metrics**:
  - `pysd.environment.setup.duration` - Time to initialize environment
  - `pysd.package.install.success` - Package installation success rate
  - `pysd.model.execution.time` - Model run duration
  
- **Events**:
  - `pysd.environment.created` - New environment initialized
  - `pysd.dependencies.installed` - PySD packages installed
  - `pysd.model.executed` - Model run completed

- **Traces**:
  - Environment setup flow
  - Package installation sequence
  - Model execution pipeline

## Rollout & Safety
- **Strategy**: Feature flagged with progressive enablement
  - Stage 1: Internal testing with test notebooks
  - Stage 2: Limited beta (5% users)
  - Stage 3: Gradual rollout (25% → 50% → 100%)
  
- **Kill switch**: `feature.pysd_integration` flag for instant disable
- **Guardrails**: 
  - Container resource limits (CPU, memory)
  - Timeout on long-running operations
  - Error rate monitoring with auto-pause at 5% threshold

## Testing Approach

### Unit Tests
1. Environment initialization creates venv structure
2. Python version verification (3.8+)
3. Package installation success/failure handling
4. PySD import verification

### Integration Tests
1. End-to-end environment setup and PySD import
2. Simple model execution test
3. Error propagation from Python to Node.js
4. Container resource management

### Test Notebooks
1. Basic PySD import and version check
2. Simple SIR model example
3. Data loading and parameter sweeps
4. Performance benchmarking

## Docs & DX
- Update MCP server README with PySD tools documentation
- Create PySD integration guide in docs/
- Add example notebooks in notebooks/examples/pysd/
- Internal runbook for troubleshooting Python environment issues

## Risks & Mitigations

### Risk 1: Python Environment Conflicts
- **Mitigation**: Use isolated Peragus containers with dedicated venv
- **Owner**: Tech Lead

### Risk 2: Network Dependency for Package Installation
- **Mitigation**: Cache PySD packages in container image, offline install option
- **Owner**: DevOps

### Risk 3: Resource Consumption by Python Processes
- **Mitigation**: Container resource limits, process monitoring, automatic cleanup
- **Owner**: SRE

## Success Criteria
1. ✅ Python 3.8+ environment successfully created in Peragus container
2. ✅ PySD and dependencies installed and importable
3. ✅ Test notebook executes simple PySD model
4. ✅ MCP tools expose PySD functionality
5. ✅ All unit and integration tests passing
6. ✅ Documentation complete and reviewed