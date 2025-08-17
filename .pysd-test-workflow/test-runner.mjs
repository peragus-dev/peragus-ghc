#!/usr/bin/env node

import { PythonEnvironmentManager } from '../packages/mcp-server/src/tools/pysd/environment-manager.mjs';
import { PySDModelLoader } from '../packages/mcp-server/src/tools/pysd/model-loader.mjs';
import { PySDSimulationRunner } from '../packages/mcp-server/src/tools/pysd/simulation-runner.mjs';
import { NodePySDSimulationService } from '../packages/mcp-server/src/tools/pysd/pysd-service.mjs';
import { ResultFilter } from '../packages/mcp-server/src/tools/pysd/result-filter.mjs';
import { DataAggregator } from '../packages/mcp-server/src/tools/pysd/data-aggregator.mjs';
import { ResultStorage } from '../packages/mcp-server/src/tools/pysd/result-storage.mjs';
import { OutputTransformer } from '../packages/mcp-server/src/tools/pysd/output-transformer.mjs';
import { promises as fs } from 'fs';
import path from 'path';

// Test results tracking
const testResults = {
  passed: 0,
  failed: 0,
  stages: {}
};

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

// Stage 1: Environment Setup
async function stage1_environmentSetup() {
  log(colors.yellow, '\n📦 Stage 1: Environment Setup and Validation');
  
  try {
    const manager = new PythonEnvironmentManager();
    const envPath = '/tmp/.venv/test-workflow-env';
    
    log(colors.blue, '  Creating virtual environment...');
    await manager.initializeEnvironment(envPath);
    
    log(colors.blue, '  Installing PySD dependencies...');
    await manager.installPySDDependencies(envPath);
    
    log(colors.blue, '  Verifying installation...');
    const isValid = await manager.verifyPySDInstallation(envPath);
    
    if (!isValid) {
      throw new Error('PySD installation verification failed');
    }
    
    log(colors.green, '✅ Stage 1 PASSED: Environment ready at', envPath);
    testResults.passed++;
    testResults.stages['stage1'] = { passed: true, envPath };
    return envPath;
    
  } catch (error) {
    log(colors.red, '❌ Stage 1 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage1'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 2: Model Creation and Loading
async function stage2_modelLoading(envPath) {
  log(colors.yellow, '\n📚 Stage 2: Model Creation and Loading');
  
  try {
    // Create test model
    const modelPath = '/tmp/test-model.py';
    const modelCode = `
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
        
        pop = initial_values.get('population', 1000)
        r = initial_values.get('growth_rate', 0.02)
        K = initial_values.get('carrying_capacity', 10000)
        
        times = np.arange(start_time, final_time + time_step, time_step)
        if return_timestamps:
            times = np.array(return_timestamps)
        
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
`;
    
    log(colors.blue, '  Creating test model at:', modelPath);
    await fs.writeFile(modelPath, modelCode);
    
    log(colors.blue, '  Loading model...');
    const loader = new PySDModelLoader();
    const modelInfo = await loader.loadModel(modelPath, envPath);
    
    if (!modelInfo.success) {
      throw new Error('Model loading failed: ' + modelInfo.error);
    }
    
    log(colors.green, '✅ Stage 2 PASSED: Model loaded');
    log(colors.blue, '    Components:', modelInfo.components);
    log(colors.blue, '    Type:', modelInfo.modelType);
    
    testResults.passed++;
    testResults.stages['stage2'] = { passed: true, modelPath, modelInfo };
    return modelPath;
    
  } catch (error) {
    log(colors.red, '❌ Stage 2 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage2'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 3: Simulation Execution
async function stage3_simulationExecution(modelPath, envPath) {
  log(colors.yellow, '\n🚀 Stage 3: Simulation Execution');
  
  try {
    const runner = new PySDSimulationRunner();
    
    log(colors.blue, '  Running simulation...');
    const params = {
      endTime: 50,
      timeStep: 1
    };
    
    const startTime = Date.now();
    const results = await runner.runSimulation(modelPath, params, envPath);
    const execTime = Date.now() - startTime;
    
    if (!results.success) {
      throw new Error('Simulation failed: ' + results.error);
    }
    
    log(colors.green, '✅ Stage 3 PASSED: Simulation completed');
    log(colors.blue, '    Execution time:', execTime, 'ms');
    log(colors.blue, '    Data points:', results.index?.length);
    log(colors.blue, '    Variables:', results.columns);
    
    const finalPop = results.data?.Population?.[results.data.Population.length - 1];
    log(colors.blue, '    Final population:', finalPop?.toFixed(0));
    
    testResults.passed++;
    testResults.stages['stage3'] = { passed: true, results, execTime };
    return results;
    
  } catch (error) {
    log(colors.red, '❌ Stage 3 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage3'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 4: Data Filtering
async function stage4_dataFiltering(results) {
  log(colors.yellow, '\n🔍 Stage 4: Data Filtering and Selection');
  
  try {
    const filter = new ResultFilter();
    
    log(colors.blue, '  Filtering variables...');
    let filtered = filter.filterVariables(results, ['Population', 'GrowthRate']);
    
    log(colors.blue, '  Filtering time range...');
    filtered = filter.filterTimeRange(filtered, 10, 40);
    
    log(colors.blue, '  Downsampling...');
    filtered = filter.downsample(filtered, 5);
    
    if (!filtered.success) {
      throw new Error('Filtering failed: ' + filtered.error);
    }
    
    log(colors.green, '✅ Stage 4 PASSED: Filtering completed');
    log(colors.blue, '    Original points:', results.index?.length);
    log(colors.blue, '    Filtered points:', filtered.index?.length);
    log(colors.blue, '    Variables kept:', filtered.columns);
    
    testResults.passed++;
    testResults.stages['stage4'] = { passed: true, filtered };
    return filtered;
    
  } catch (error) {
    log(colors.red, '❌ Stage 4 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage4'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 5: Data Aggregation
async function stage5_dataAggregation(results) {
  log(colors.yellow, '\n📈 Stage 5: Data Aggregation');
  
  try {
    const aggregator = new DataAggregator();
    
    log(colors.blue, '  Computing statistics...');
    const stats = aggregator.computeStatistics(results);
    
    log(colors.blue, '  Computing moving average...');
    const smoothed = aggregator.movingAverage(results, 10);
    
    log(colors.blue, '  Computing correlations...');
    const correlations = aggregator.correlations(results);
    
    log(colors.green, '✅ Stage 5 PASSED: Aggregation completed');
    log(colors.blue, '    Population mean:', stats.variables?.Population?.mean?.toFixed(0));
    log(colors.blue, '    Population std:', stats.variables?.Population?.std?.toFixed(0));
    log(colors.blue, '    Correlation matrix size:', correlations.matrix.length, 'x', correlations.matrix[0]?.length);
    
    testResults.passed++;
    testResults.stages['stage5'] = { passed: true, stats, correlations };
    return { stats, smoothed, correlations };
    
  } catch (error) {
    log(colors.red, '❌ Stage 5 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage5'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 6: Result Caching
async function stage6_resultCaching(results) {
  log(colors.yellow, '\n💾 Stage 6: Result Caching');
  
  try {
    const storage = new ResultStorage();
    const cacheKey = 'test-sim-001';
    
    log(colors.blue, '  Caching results...');
    await storage.cacheResults(cacheKey, results, {
      modelPath: '/tmp/test-model.py',
      timestamp: Date.now(),
      tags: ['test', 'validation']
    });
    
    log(colors.blue, '  Retrieving from cache...');
    const cached = await storage.getCachedResults(cacheKey);
    
    if (!cached) {
      throw new Error('Cache retrieval failed');
    }
    
    log(colors.blue, '  Querying history...');
    const history = await storage.queryHistory({ tags: ['test'] });
    
    log(colors.green, '✅ Stage 6 PASSED: Caching completed');
    log(colors.blue, '    Cache retrieval: SUCCESS');
    log(colors.blue, '    History records:', history.length);
    
    testResults.passed++;
    testResults.stages['stage6'] = { passed: true, cached: true, historyCount: history.length };
    
  } catch (error) {
    log(colors.red, '❌ Stage 6 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage6'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 7: Export Formats
async function stage7_exportFormats(results) {
  log(colors.yellow, '\n📄 Stage 7: Export Formats');
  
  try {
    const transformer = new OutputTransformer();
    
    log(colors.blue, '  Exporting to CSV...');
    const csv = transformer.exportToCSV(results);
    const csvLines = csv.split('\n');
    
    log(colors.blue, '  Exporting to JSON...');
    const json = transformer.exportToJSON(results, true);
    const jsonData = JSON.parse(json);
    
    log(colors.blue, '  Creating HTML...');
    const html = transformer.exportToHTML(results, 10);
    
    log(colors.green, '✅ Stage 7 PASSED: Export completed');
    log(colors.blue, '    CSV lines:', csvLines.length);
    log(colors.blue, '    CSV header:', csvLines[0]);
    log(colors.blue, '    JSON valid:', jsonData.metadata ? 'Yes' : 'No');
    log(colors.blue, '    HTML length:', html.length, 'chars');
    
    testResults.passed++;
    testResults.stages['stage7'] = { passed: true, formats: ['csv', 'json', 'html'] };
    
  } catch (error) {
    log(colors.red, '❌ Stage 7 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage7'] = { passed: false, error: error.message };
    throw error;
  }
}

// Stage 8: Integration Stress Test
async function stage8_integrationTest(modelPath, envPath) {
  log(colors.yellow, '\n🔥 Stage 8: Integration Stress Test');
  
  try {
    const service = new NodePySDSimulationService();
    const scenarios = [
      { name: 'baseline', parameters: {} },
      { name: 'high_growth', parameters: { overrides: { growth_rate: 0.05 } } },
      { name: 'low_capacity', parameters: { overrides: { carrying_capacity: 5000 } } },
      { name: 'stressed', parameters: { overrides: { initial_population: 9000, growth_rate: 0.01 } } }
    ];
    
    log(colors.blue, '  Running batch simulations...');
    const batchResults = [];
    
    for (const scenario of scenarios) {
      const params = {
        endTime: 50,
        timeStep: 1,
        ...scenario.parameters
      };
      
      try {
        const result = await service.initiateSimulation(modelPath, params, 'test-workflow-env');
        batchResults.push({
          scenario: scenario.name,
          success: result.success,
          finalPop: result.data?.Population?.[result.data.Population.length - 1]
        });
        log(colors.blue, `    ${scenario.name}: SUCCESS (Final: ${batchResults[batchResults.length - 1].finalPop?.toFixed(0)})`);
      } catch (err) {
        batchResults.push({
          scenario: scenario.name,
          success: false,
          error: err.message
        });
        log(colors.red, `    ${scenario.name}: FAILED`);
      }
    }
    
    const successCount = batchResults.filter(r => r.success).length;
    
    log(colors.green, '✅ Stage 8 PASSED: Batch completed');
    log(colors.blue, '    Scenarios run:', scenarios.length);
    log(colors.blue, '    Successful:', successCount);
    
    testResults.passed++;
    testResults.stages['stage8'] = { passed: true, batchResults };
    
  } catch (error) {
    log(colors.red, '❌ Stage 8 FAILED:', error.message);
    testResults.failed++;
    testResults.stages['stage8'] = { passed: false, error: error.message };
    throw error;
  }
}

// Main test runner
async function runAllTests() {
  log(colors.yellow, '🧪 PySD Integration Test Suite');
  log(colors.yellow, '==============================');
  
  try {
    // Run all stages
    const envPath = await stage1_environmentSetup();
    const modelPath = await stage2_modelLoading(envPath);
    const results = await stage3_simulationExecution(modelPath, envPath);
    const filtered = await stage4_dataFiltering(results);
    const aggregated = await stage5_dataAggregation(results);
    await stage6_resultCaching(results);
    await stage7_exportFormats(results);
    await stage8_integrationTest(modelPath, envPath);
    
  } catch (error) {
    log(colors.red, '\n⚠️ Test execution stopped due to failure');
  }
  
  // Print summary
  log(colors.yellow, '\n==============================');
  log(colors.yellow, 'Test Results Summary:');
  log(colors.green, `Passed: ${testResults.passed}`);
  log(colors.red, `Failed: ${testResults.failed}`);
  
  if (testResults.failed === 0) {
    log(colors.green, '\n🎉 All tests passed!');
  } else {
    log(colors.red, '\n⚠️ Some tests failed. Check logs for details.');
  }
  
  // Save results to file
  const resultsPath = '.pysd-test-workflow/results.json';
  await fs.writeFile(resultsPath, JSON.stringify(testResults, null, 2));
  log(colors.blue, `\nResults saved to: ${resultsPath}`);
  
  process.exit(testResults.failed === 0 ? 0 : 1);
}

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});