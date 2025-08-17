# PySD Integration Test Workflow

## Overview
This document describes a comprehensive end-to-end test workflow that validates the complete PySD integration across all three implemented phases. This workflow will illuminate any integration issues, missing dependencies, or broken functionality.

## Prerequisites
- Node.js environment with pnpm
- Python 3.8+ (for PySD backend)
- All Phase 1-3 components installed

## Test Workflow Stages

### Stage 1: Environment Setup and Validation
Tests Phase 1 implementation (Python Environment & PySD Setup)

```bash
# 1.1 Initialize PySD environment
node -e "
const { handlePysdEnvironmentSetup } = require('./packages/mcp-server/dist/tools/pysd/pysd-runner.mjs');

(async () => {
  console.log('🔧 Setting up PySD environment...');
  const result = await handlePysdEnvironmentSetup({
    environment_id: 'test-workflow-env'
  });
  
  if (!result.success) {
    console.error('❌ Environment setup failed:', result.error);
    process.exit(1);
  }
  
  console.log('✅ Environment ready:', result.path);
})();
"

# Expected Output:
# ✅ Environment ready: /workdir/.venv/test-workflow-env
# If fails: Missing Python, incorrect paths, or dependency installation issues
```

### Stage 2: Model Creation and Loading
Tests Phase 2 implementation (Core Model Loading & Execution)

```bash
# 2.1 Create a test model
cat > /tmp/test-model.py << 'EOF'
import numpy as np
import pandas as pd

class TestSystemDynamicsModel:
    def __init__(self):
        self.components = type('Components', (), {
            '_namespace': {
                'initial_population': 1000,
                'growth_rate': 0.02,
                'carrying_capacity': 10000
            }
        })()
    
    def doc(self):
        return {
            "description": "Logistic growth model",
            "units": {
                "population": "individuals",
                "growth_rate": "1/time",
                "carrying_capacity": "individuals"
            }
        }
    
    def run(self, initial_condition=None, final_time=100, time_step=1, 
            saveper=None, return_timestamps=None):
        
        if initial_condition and isinstance(initial_condition, tuple):
            start_time, initial_values = initial_condition
        else:
            start_time = 0
            initial_values = {}
        
        # Parameters
        pop = initial_values.get('population', 1000)
        r = initial_values.get('growth_rate', 0.02)
        K = initial_values.get('carrying_capacity', 10000)
        
        # Time array
        times = np.arange(start_time, final_time + time_step, time_step)
        if return_timestamps:
            times = np.array(return_timestamps)
        
        # Simulate logistic growth
        populations = []
        growth_rates = []
        
        for t in times:
            populations.append(pop)
            growth = r * pop * (1 - pop / K)
            growth_rates.append(growth)
            pop = pop + growth * time_step
        
        return pd.DataFrame({
            'Time': times,
            'Population': populations,
            'GrowthRate': growth_rates,
            'CarryingCapacity': [K] * len(times)
        }).set_index('Time')

model = TestSystemDynamicsModel()
EOF

# 2.2 Load the model
node -e "
const { handlePysdLoadModel } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');

(async () => {
  console.log('📚 Loading model...');
  const result = await handlePysdLoadModel({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env'
  });
  
  const parsed = JSON.parse(result.content[0].text);
  if (!parsed.success) {
    console.error('❌ Model load failed:', parsed.error);
    process.exit(1);
  }
  
  console.log('✅ Model loaded successfully');
  console.log('  Components:', parsed.components);
  console.log('  Type:', parsed.modelType);
})();
"

# Expected Output:
# ✅ Model loaded successfully
#   Components: ['initial_population', 'growth_rate', 'carrying_capacity']
#   Type: python
# If fails: Model parsing errors, Python bridge issues
```

### Stage 3: Simulation Execution
Tests Phase 2 simulation runner

```bash
# 3.1 Run a basic simulation
node -e "
const { handlePysdRunSimulation } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');

(async () => {
  console.log('🚀 Running simulation...');
  const result = await handlePysdRunSimulation({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env',
    end_time: 50,
    time_step: 1
  });
  
  const parsed = JSON.parse(result.content[0].text);
  if (!parsed.success) {
    console.error('❌ Simulation failed:', parsed.error);
    process.exit(1);
  }
  
  console.log('✅ Simulation completed');
  console.log('  Execution time:', parsed.executionTime, 'ms');
  console.log('  Data points:', parsed.index.length);
  console.log('  Variables:', parsed.columns);
  console.log('  Final population:', parsed.data.Population[parsed.data.Population.length - 1]);
})();
"

# Expected Output:
# ✅ Simulation completed
#   Execution time: ~200 ms
#   Data points: 51
#   Variables: ['Time', 'Population', 'GrowthRate', 'CarryingCapacity']
#   Final population: ~2640
# If fails: Simulation engine errors, parameter issues
```

### Stage 4: Data Filtering and Selection
Tests Phase 3 result filtering

```bash
# 4.1 Filter variables and time range
node -e "
const { handlePysdRunSimulation } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');
const { handlePysdFilterResults } = require('./packages/mcp-server/dist/tools/pysd/advanced-output-service.mjs');

(async () => {
  // First get full results
  console.log('📊 Getting simulation results...');
  const simResult = await handlePysdRunSimulation({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env',
    end_time: 100,
    time_step: 1
  });
  
  const results = JSON.parse(simResult.content[0].text);
  
  // Filter results
  console.log('🔍 Filtering results...');
  const filtered = await handlePysdFilterResults({
    results: results,
    variables: ['Population', 'GrowthRate'],
    start_time: 20,
    end_time: 60,
    downsample_step: 5
  });
  
  const filteredData = JSON.parse(filtered.content[0].text);
  if (!filteredData.success) {
    console.error('❌ Filtering failed:', filteredData.error);
    process.exit(1);
  }
  
  console.log('✅ Filtering completed');
  console.log('  Original points:', results.index.length);
  console.log('  Filtered points:', filteredData.index.length);
  console.log('  Variables kept:', filteredData.columns);
})();
"

# Expected Output:
# ✅ Filtering completed
#   Original points: 101
#   Filtered points: 9
#   Variables kept: ['Time', 'Population', 'GrowthRate']
# If fails: Filter logic errors, data structure issues
```

### Stage 5: Data Aggregation
Tests Phase 3 aggregation utilities

```bash
# 5.1 Compute statistics and correlations
node -e "
const { handlePysdRunSimulation } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');
const { handlePysdAggregateData } = require('./packages/mcp-server/dist/tools/pysd/advanced-output-service.mjs');

(async () => {
  // Get simulation results
  const simResult = await handlePysdRunSimulation({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env',
    end_time: 100,
    time_step: 1
  });
  
  const results = JSON.parse(simResult.content[0].text);
  
  // Compute aggregations
  console.log('📈 Computing aggregations...');
  const aggregated = await handlePysdAggregateData({
    results: results,
    compute_statistics: true,
    moving_average_window: 10,
    correlations: true
  });
  
  const aggData = JSON.parse(aggregated.content[0].text);
  if (!aggData.success) {
    console.error('❌ Aggregation failed');
    process.exit(1);
  }
  
  console.log('✅ Aggregation completed');
  console.log('  Population mean:', aggData.statistics.variables.Population.mean.toFixed(0));
  console.log('  Population std:', aggData.statistics.variables.Population.std.toFixed(0));
  console.log('  Growth rate correlation with population:', 
    aggData.correlations.matrix[0][1].toFixed(3));
})();
"

# Expected Output:
# ✅ Aggregation completed
#   Population mean: ~4721
#   Population std: ~2574
#   Growth rate correlation with population: ~-0.950
# If fails: Statistical computation errors, correlation issues
```

### Stage 6: Result Caching
Tests Phase 3 caching and storage

```bash
# 6.1 Cache and retrieve results
node -e "
const { handlePysdRunSimulation } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');
const { handlePysdCacheResults } = require('./packages/mcp-server/dist/tools/pysd/advanced-output-service.mjs');

(async () => {
  // Run simulation
  const simResult = await handlePysdRunSimulation({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env',
    end_time: 50,
    time_step: 1,
    overrides: { initial_population: 500 }
  });
  
  const results = JSON.parse(simResult.content[0].text);
  
  // Cache results
  console.log('💾 Caching results...');
  const cacheResult = await handlePysdCacheResults({
    operation: 'store',
    key: 'test-sim-001',
    results: results,
    metadata: {
      modelPath: '/tmp/test-model.py',
      parameters: { initial_population: 500 },
      tags: ['test', 'logistic', 'validation']
    }
  });
  
  console.log('✅ Results cached');
  
  // Retrieve cached results
  console.log('🔄 Retrieving from cache...');
  const retrieved = await handlePysdCacheResults({
    operation: 'retrieve',
    key: 'test-sim-001'
  });
  
  const cacheData = JSON.parse(retrieved.content[0].text);
  console.log('✅ Cache retrieval:', cacheData.found ? 'SUCCESS' : 'FAILED');
  
  // Query history
  console.log('📜 Querying history...');
  const history = await handlePysdCacheResults({
    operation: 'query',
    query: { tags: ['test'] }
  });
  
  const historyData = JSON.parse(history.content[0].text);
  console.log('✅ History records found:', historyData.count);
})();
"

# Expected Output:
# ✅ Results cached
# ✅ Cache retrieval: SUCCESS
# ✅ History records found: 1
# If fails: Cache storage issues, retrieval logic errors
```

### Stage 7: Export Formats
Tests Phase 3 export capabilities

```bash
# 7.1 Export to multiple formats
node -e "
const { handlePysdRunSimulation } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');
const { handlePysdExportResults } = require('./packages/mcp-server/dist/tools/pysd/advanced-output-service.mjs');

(async () => {
  // Get simulation results
  const simResult = await handlePysdRunSimulation({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env',
    end_time: 10,
    time_step: 1
  });
  
  const results = JSON.parse(simResult.content[0].text);
  
  // Export to CSV
  console.log('📄 Exporting to CSV...');
  const csvExport = await handlePysdExportResults({
    results: results,
    format: 'csv',
    options: { delimiter: ',' }
  });
  
  const csvLines = csvExport.content[0].text.split('\\n');
  console.log('✅ CSV export:', csvLines.length, 'lines');
  console.log('  Header:', csvLines[0]);
  
  // Export to JSON
  console.log('📋 Exporting to JSON...');
  const jsonExport = await handlePysdExportResults({
    results: results,
    format: 'json',
    options: { pretty: true }
  });
  
  const jsonData = JSON.parse(jsonExport.content[0].text);
  console.log('✅ JSON export:', 
    jsonData.metadata ? 'Valid with metadata' : 'Invalid structure');
})();
"

# Expected Output:
# ✅ CSV export: 12 lines
#   Header: Time,Population,GrowthRate,CarryingCapacity
# ✅ JSON export: Valid with metadata
# If fails: Export formatting errors, data conversion issues
```

### Stage 8: Integration Stress Test
Tests all phases working together under load

```bash
# 8.1 Run multiple simulations with different parameters
node -e "
const { handlePysdBatchSimulation } = require('./packages/mcp-server/dist/tools/pysd/pysd-service.mjs');

(async () => {
  console.log('🔥 Running batch simulations...');
  
  const scenarios = [
    { name: 'baseline', parameters: {} },
    { name: 'high_growth', parameters: { growth_rate: 0.05 } },
    { name: 'low_capacity', parameters: { carrying_capacity: 5000 } },
    { name: 'stressed', parameters: { initial_population: 9000, growth_rate: 0.01 } }
  ];
  
  const batchResult = await handlePysdBatchSimulation({
    model_path: '/tmp/test-model.py',
    environment_id: 'test-workflow-env',
    scenarios: scenarios,
    base_parameters: { endTime: 50, timeStep: 1 }
  });
  
  const batchData = JSON.parse(batchResult.content[0].text);
  if (!batchData.success) {
    console.error('❌ Batch simulation failed');
    process.exit(1);
  }
  
  console.log('✅ Batch completed');
  console.log('  Scenarios run:', batchData.totalScenarios);
  
  for (const result of batchData.results) {
    const finalPop = result.data?.Population?.[result.data.Population.length - 1];
    console.log(\`  \${result.scenario}: \${result.success ? 'SUCCESS' : 'FAILED'}\`,
      finalPop ? \`(Final: \${finalPop.toFixed(0)})\` : '');
  }
})();
"

# Expected Output:
# ✅ Batch completed
#   Scenarios run: 4
#   baseline: SUCCESS (Final: 2640)
#   high_growth: SUCCESS (Final: 5832)
#   low_capacity: SUCCESS (Final: 2237)
#   stressed: SUCCESS (Final: 9407)
# If fails: Batch processing errors, parallel execution issues
```

## Error Detection Matrix

| Stage | Component Tested | Potential Failures | Error Indicators |
|-------|-----------------|-------------------|------------------|
| 1 | Environment Setup | Python missing, pip failures | "command not found", "permission denied" |
| 2 | Model Loading | Import errors, format issues | "Failed to load model", "invalid syntax" |
| 3 | Simulation Engine | Numerical errors, memory issues | "NaN", "out of memory", timeout |
| 4 | Data Filtering | Index errors, type mismatches | "undefined", "cannot read property" |
| 5 | Aggregation | Statistical errors, empty data | "division by zero", "empty array" |
| 6 | Caching | Storage limits, serialization | "cache full", "circular reference" |
| 7 | Export | Format errors, encoding issues | "invalid character", "buffer overflow" |
| 8 | Integration | Race conditions, resource leaks | timeouts, "EMFILE", memory growth |

## Performance Benchmarks

Expected timings for test workflow:

| Operation | Expected Time | Warning Threshold | Error Threshold |
|-----------|--------------|-------------------|-----------------|
| Environment Setup | < 5s | > 10s | > 30s |
| Model Load | < 500ms | > 2s | > 5s |
| Simple Simulation (100 steps) | < 200ms | > 1s | > 5s |
| Filter 100 points | < 5ms | > 10ms | > 50ms |
| Compute Statistics | < 10ms | > 50ms | > 200ms |
| Cache Store/Retrieve | < 5ms | > 20ms | > 100ms |
| CSV Export (100 rows) | < 10ms | > 50ms | > 200ms |
| Batch (4 scenarios) | < 1s | > 3s | > 10s |

## Validation Script

Save this as `test-pysd-integration.sh`:

```bash
#!/bin/bash

set -e

echo "🧪 PySD Integration Test Suite"
echo "=============================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to run a test stage
run_test() {
    local stage=$1
    local description=$2
    local command=$3
    
    echo -e "\n${YELLOW}Stage $stage: $description${NC}"
    
    if eval "$command" > /tmp/test-output.log 2>&1; then
        echo -e "${GREEN}✅ PASSED${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}❌ FAILED${NC}"
        echo "Error output:"
        tail -20 /tmp/test-output.log
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Run all stages
run_test 1 "Environment Setup" "node -e '...' # Stage 1 code"
run_test 2 "Model Loading" "node -e '...' # Stage 2 code"
run_test 3 "Simulation Execution" "node -e '...' # Stage 3 code"
run_test 4 "Data Filtering" "node -e '...' # Stage 4 code"
run_test 5 "Data Aggregation" "node -e '...' # Stage 5 code"
run_test 6 "Result Caching" "node -e '...' # Stage 6 code"
run_test 7 "Export Formats" "node -e '...' # Stage 7 code"
run_test 8 "Batch Processing" "node -e '...' # Stage 8 code"

# Summary
echo -e "\n=============================="
echo -e "Test Results:"
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}🎉 All tests passed!${NC}"
    exit 0
else
    echo -e "\n${RED}⚠️ Some tests failed. Check logs for details.${NC}"
    exit 1
fi
```

## Troubleshooting Guide

### Common Issues and Solutions

1. **Python Environment Errors**
   - Symptom: "Python not found" or "pip: command not found"
   - Solution: Ensure Python 3.8+ is installed and in PATH

2. **Module Import Failures**
   - Symptom: "ModuleNotFoundError: No module named 'pysd'"
   - Solution: Verify PySD installation in virtual environment

3. **Type Errors in Node.js**
   - Symptom: "Cannot read property 'x' of undefined"
   - Solution: Check that all phases are built (`pnpm build`)

4. **Memory Issues**
   - Symptom: "JavaScript heap out of memory"
   - Solution: Increase Node memory: `NODE_OPTIONS="--max-old-space-size=4096"`

5. **Timeout Errors**
   - Symptom: Tests hang or timeout
   - Solution: Check Python process cleanup, increase timeout limits

## Continuous Integration

Add to `.github/workflows/test-pysd.yml`:

```yaml
name: PySD Integration Tests

on:
  push:
    paths:
      - 'packages/mcp-server/src/tools/pysd/**'
      - 'packages/mcp-server/test/**pysd**'
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - uses: actions/setup-python@v4
      with:
        python-version: '3.8'
    
    - name: Install dependencies
      run: |
        pnpm install
        pip install pysd numpy pandas
    
    - name: Build project
      run: pnpm build
    
    - name: Run integration tests
      run: bash test-pysd-integration.sh
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: test-results
        path: /tmp/test-output.log
```

## Conclusion

This comprehensive test workflow validates:
- ✅ All Phase 1 environment setup capabilities
- ✅ All Phase 2 model loading and simulation features
- ✅ All Phase 3 data processing and export functions
- ✅ Integration between all components
- ✅ Performance under various scenarios
- ✅ Error handling and edge cases

Running this workflow will immediately illuminate any broken functionality, missing dependencies, or integration issues across the entire PySD implementation.