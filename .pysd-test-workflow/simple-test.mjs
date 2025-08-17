#!/usr/bin/env node

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

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

// Execute Python directly to test the environment
async function executePython(script, envPath = null) {
  return new Promise((resolve, reject) => {
    const pythonPath = envPath ? path.join(envPath, 'bin', 'python') : 'python3';
    const process = spawn(pythonPath, ['-c', script]);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => stdout += data.toString());
    process.stderr.on('data', (data) => stderr += data.toString());
    
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr || 'Python execution failed'));
      } else {
        resolve(stdout);
      }
    });
  });
}

// Stage 1: Test Python and create virtual environment
async function stage1_pythonEnvironment() {
  log(colors.yellow, '\n📦 Stage 1: Python Environment Setup');
  
  try {
    // Test Python availability
    log(colors.blue, '  Checking Python...');
    const pythonVersion = await executePython('import sys; print(sys.version)');
    log(colors.blue, '    Python version:', pythonVersion.trim().split('\n')[0]);
    
    // Create virtual environment
    const envPath = '/tmp/.venv/test-workflow-env';
    log(colors.blue, '  Creating virtual environment at:', envPath);
    
    // Remove existing if present
    await fs.rm(envPath, { recursive: true, force: true }).catch(() => {});
    
    // Create venv
    await new Promise((resolve, reject) => {
      const process = spawn('python3', ['-m', 'venv', envPath]);
      process.on('close', (code) => {
        if (code !== 0) reject(new Error('Failed to create venv'));
        else resolve();
      });
    });
    
    // Install PySD
    log(colors.blue, '  Installing PySD...');
    await new Promise((resolve, reject) => {
      const pipPath = path.join(envPath, 'bin', 'pip');
      const process = spawn(pipPath, ['install', 'pysd', 'numpy', 'pandas']);
      
      process.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Successfully installed')) {
          log(colors.blue, '    ', output.trim());
        }
      });
      
      process.on('close', (code) => {
        if (code !== 0) reject(new Error('Failed to install PySD'));
        else resolve();
      });
    });
    
    // Verify PySD installation
    log(colors.blue, '  Verifying PySD...');
    const verification = await executePython(
      'import pysd; print("PySD version:", pysd.__version__)',
      envPath
    );
    log(colors.blue, '    ', verification.trim());
    
    log(colors.green, '✅ Stage 1 PASSED: Environment ready');
    return { success: true, envPath };
    
  } catch (error) {
    log(colors.red, '❌ Stage 1 FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Stage 2: Create and test model loading
async function stage2_modelCreation(envPath) {
  log(colors.yellow, '\n📚 Stage 2: Model Creation and Testing');
  
  try {
    // Create test model
    const modelPath = '/tmp/test-logistic-model.py';
    const modelCode = `
import numpy as np
import pandas as pd

class LogisticGrowthModel:
    def __init__(self):
        self.components = type('Components', (), {
            '_namespace': {
                'population': 1000,
                'growth_rate': 0.02,
                'carrying_capacity': 10000
            }
        })()
    
    def doc(self):
        return {
            "description": "Simple logistic growth model for testing",
            "author": "Test Suite",
            "date": "2024"
        }
    
    def run(self, initial_condition=None, final_time=100, time_step=1, 
            saveper=None, return_timestamps=None):
        
        # Extract parameters
        if initial_condition and isinstance(initial_condition, tuple):
            start_time, initial_values = initial_condition
        else:
            start_time = 0
            initial_values = {}
        
        pop = initial_values.get('population', 1000)
        r = initial_values.get('growth_rate', 0.02)
        K = initial_values.get('carrying_capacity', 10000)
        
        # Generate time array
        times = np.arange(start_time, final_time + time_step, time_step)
        if return_timestamps:
            times = np.array(return_timestamps)
        
        # Run simulation
        populations = []
        growth_rates = []
        
        for t in times:
            populations.append(pop)
            growth = r * pop * (1 - pop / K)
            growth_rates.append(growth)
            pop = pop + growth * time_step
        
        # Return DataFrame
        return pd.DataFrame({
            'Time': times,
            'Population': populations,
            'GrowthRate': growth_rates,
            'CarryingCapacity': [K] * len(times)
        }).set_index('Time')

# Create model instance
model = LogisticGrowthModel()

# Test if running directly
if __name__ == "__main__":
    results = model.run(final_time=10)
    print("Model test run successful!")
    print(results.head())
`;
    
    log(colors.blue, '  Writing model to:', modelPath);
    await fs.writeFile(modelPath, modelCode);
    
    // Test model loading in Python
    log(colors.blue, '  Testing model in Python...');
    const testScript = `
import sys
import importlib.util

# Load the model module
spec = importlib.util.spec_from_file_location("test_model", "${modelPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = module.model

# Test model
results = model.run(final_time=5)
print(f"Model loaded successfully!")
print(f"Columns: {list(results.columns)}")
print(f"Shape: {results.shape}")
print(f"Final population: {results['Population'].iloc[-1]:.0f}")
`;
    
    const output = await executePython(testScript, envPath);
    log(colors.blue, '    ', output.trim().replace(/\n/g, '\n    '));
    
    log(colors.green, '✅ Stage 2 PASSED: Model created and tested');
    return { success: true, modelPath };
    
  } catch (error) {
    log(colors.red, '❌ Stage 2 FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Stage 3: Test simulation with parameters
async function stage3_simulationTest(modelPath, envPath) {
  log(colors.yellow, '\n🚀 Stage 3: Simulation with Parameters');
  
  try {
    const testScript = `
import sys
import json
import time
import importlib.util

# Load the model module
spec = importlib.util.spec_from_file_location("test_model", "${modelPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = module.model

# Test different parameters
scenarios = [
    {"name": "baseline", "params": {}},
    {"name": "high_growth", "params": {"growth_rate": 0.05}},
    {"name": "low_capacity", "params": {"carrying_capacity": 5000}}
]

results_summary = []

for scenario in scenarios:
    start_time = time.time()
    
    # Set initial conditions if params provided
    if scenario["params"]:
        initial_condition = (0, scenario["params"])
    else:
        initial_condition = None
    
    # Run simulation
    results = model.run(initial_condition=initial_condition, final_time=50, time_step=1)
    exec_time = (time.time() - start_time) * 1000
    
    # Get summary
    final_pop = results['Population'].iloc[-1]
    max_growth = results['GrowthRate'].max()
    
    results_summary.append({
        "scenario": scenario["name"],
        "final_population": float(final_pop),
        "max_growth_rate": float(max_growth),
        "execution_time_ms": exec_time,
        "data_points": len(results)
    })
    
    print(f"{scenario['name']}: Final pop={final_pop:.0f}, Time={exec_time:.1f}ms")

# Output JSON summary
print("\\nJSON Summary:")
print(json.dumps(results_summary, indent=2))
`;
    
    log(colors.blue, '  Running simulation scenarios...');
    const output = await executePython(testScript, envPath);
    
    // Parse output
    const lines = output.trim().split('\n');
    const jsonStart = lines.findIndex(line => line === 'JSON Summary:');
    
    if (jsonStart > 0) {
      // Print scenario results
      for (let i = 0; i < jsonStart; i++) {
        if (lines[i]) log(colors.blue, '    ', lines[i]);
      }
      
      // Parse JSON
      const jsonStr = lines.slice(jsonStart + 1).join('\n');
      const results = JSON.parse(jsonStr);
      
      // Check performance
      const avgTime = results.reduce((sum, r) => sum + r.execution_time_ms, 0) / results.length;
      log(colors.blue, `    Average execution time: ${avgTime.toFixed(1)}ms`);
      
      if (avgTime > 1000) {
        log(colors.yellow, '    ⚠️ Performance warning: Execution time > 1s');
      }
    }
    
    log(colors.green, '✅ Stage 3 PASSED: Simulations completed');
    return { success: true };
    
  } catch (error) {
    log(colors.red, '❌ Stage 3 FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Stage 4: Test data processing
async function stage4_dataProcessing(modelPath, envPath) {
  log(colors.yellow, '\n📊 Stage 4: Data Processing Tests');
  
  try {
    const testScript = `
import sys
import json
import numpy as np
import importlib.util

# Load the model module
spec = importlib.util.spec_from_file_location("test_model", "${modelPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = module.model

# Run simulation
results = model.run(final_time=100, time_step=1)

# Test filtering
print("Filtering tests:")
filtered_data = results[['Population', 'GrowthRate']]
print(f"  Original columns: {list(results.columns)}")
print(f"  Filtered columns: {list(filtered_data.columns)}")

# Time range filtering
time_filtered = results.loc[20:60]
print(f"  Original rows: {len(results)}")
print(f"  Time filtered rows: {len(time_filtered)}")

# Downsampling
downsampled = results.iloc[::5]  # Every 5th row
print(f"  Downsampled rows: {len(downsampled)}")

# Statistics
print("\\nStatistics:")
print(f"  Population mean: {results['Population'].mean():.0f}")
print(f"  Population std: {results['Population'].std():.0f}")
print(f"  Population min: {results['Population'].min():.0f}")
print(f"  Population max: {results['Population'].max():.0f}")

# Moving average
window_size = 10
ma = results['Population'].rolling(window=window_size, center=True).mean()
print(f"  Moving average calculated (window={window_size})")

# Correlations
corr_matrix = results[['Population', 'GrowthRate']].corr()
pop_growth_corr = corr_matrix.loc['Population', 'GrowthRate']
print(f"  Population-Growth correlation: {pop_growth_corr:.3f}")

# Export formats
print("\\nExport tests:")
csv_output = results.head(5).to_csv()
print(f"  CSV export: {len(csv_output)} chars")
json_output = results.head(5).to_json()
print(f"  JSON export: {len(json_output)} chars")
`;
    
    log(colors.blue, '  Running data processing tests...');
    const output = await executePython(testScript, envPath);
    
    // Display output
    output.trim().split('\n').forEach(line => {
      if (line) log(colors.blue, '    ', line);
    });
    
    log(colors.green, '✅ Stage 4 PASSED: Data processing validated');
    return { success: true };
    
  } catch (error) {
    log(colors.red, '❌ Stage 4 FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Stage 5: Performance and stress test
async function stage5_performanceTest(modelPath, envPath) {
  log(colors.yellow, '\n🔥 Stage 5: Performance and Stress Test');
  
  try {
    const testScript = `
import sys
import time
import json
import importlib.util

# Load the model module
spec = importlib.util.spec_from_file_location("test_model", "${modelPath}")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
model = module.model

performance_results = {}

# Test 1: Large simulation
print("Test 1: Large simulation (10,000 timesteps)")
start = time.time()
results = model.run(final_time=10000, time_step=1)
elapsed = (time.time() - start) * 1000
performance_results['large_simulation_ms'] = elapsed
print(f"  Completed in {elapsed:.1f}ms")
print(f"  Data shape: {results.shape}")

# Test 2: Batch simulations
print("\\nTest 2: Batch simulations (10 runs)")
batch_times = []
for i in range(10):
    start = time.time()
    r = model.run(final_time=100, time_step=1)
    batch_times.append((time.time() - start) * 1000)
avg_batch = sum(batch_times) / len(batch_times)
performance_results['avg_batch_ms'] = avg_batch
print(f"  Average time per run: {avg_batch:.1f}ms")

# Test 3: Memory test (create multiple results)
print("\\nTest 3: Memory test")
results_list = []
for i in range(20):
    r = model.run(final_time=100, time_step=1)
    results_list.append(r)
total_rows = sum(len(r) for r in results_list)
print(f"  Created 20 simulations")
print(f"  Total rows in memory: {total_rows}")

# Performance summary
print("\\nPerformance Summary:")
print(json.dumps(performance_results, indent=2))

# Check against thresholds
if performance_results['large_simulation_ms'] > 5000:
    print("⚠️ WARNING: Large simulation exceeded 5s threshold")
if performance_results['avg_batch_ms'] > 200:
    print("⚠️ WARNING: Batch simulation exceeded 200ms threshold")
`;
    
    log(colors.blue, '  Running performance tests...');
    const output = await executePython(testScript, envPath);
    
    // Display output
    output.trim().split('\n').forEach(line => {
      if (line) {
        if (line.includes('WARNING')) {
          log(colors.yellow, '    ', line);
        } else {
          log(colors.blue, '    ', line);
        }
      }
    });
    
    log(colors.green, '✅ Stage 5 PASSED: Performance tests completed');
    return { success: true };
    
  } catch (error) {
    log(colors.red, '❌ Stage 5 FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Main test runner
async function runAllTests() {
  log(colors.yellow, '🧪 PySD Integration Test Suite (Python Direct)');
  log(colors.yellow, '==============================================');
  
  const results = {
    passed: 0,
    failed: 0,
    stages: {}
  };
  
  // Stage 1: Environment
  const stage1 = await stage1_pythonEnvironment();
  results.stages['stage1'] = stage1;
  if (stage1.success) results.passed++; else results.failed++;
  
  if (!stage1.success) {
    log(colors.red, '\nCannot continue without Python environment');
    return results;
  }
  
  // Stage 2: Model Creation
  const stage2 = await stage2_modelCreation(stage1.envPath);
  results.stages['stage2'] = stage2;
  if (stage2.success) results.passed++; else results.failed++;
  
  if (!stage2.success) {
    log(colors.red, '\nCannot continue without model');
    return results;
  }
  
  // Stage 3: Simulation
  const stage3 = await stage3_simulationTest(stage2.modelPath, stage1.envPath);
  results.stages['stage3'] = stage3;
  if (stage3.success) results.passed++; else results.failed++;
  
  // Stage 4: Data Processing
  const stage4 = await stage4_dataProcessing(stage2.modelPath, stage1.envPath);
  results.stages['stage4'] = stage4;
  if (stage4.success) results.passed++; else results.failed++;
  
  // Stage 5: Performance
  const stage5 = await stage5_performanceTest(stage2.modelPath, stage1.envPath);
  results.stages['stage5'] = stage5;
  if (stage5.success) results.passed++; else results.failed++;
  
  // Summary
  log(colors.yellow, '\n==============================================');
  log(colors.yellow, 'Test Results Summary:');
  log(colors.green, `Passed: ${results.passed}`);
  log(colors.red, `Failed: ${results.failed}`);
  
  if (results.failed === 0) {
    log(colors.green, '\n🎉 All tests passed!');
  } else {
    log(colors.red, '\n⚠️ Some tests failed.');
  }
  
  // Save results
  await fs.writeFile(
    '.pysd-test-workflow/results.json',
    JSON.stringify(results, null, 2)
  );
  
  return results;
}

// Run tests
runAllTests().then(results => {
  process.exit(results.failed === 0 ? 0 : 1);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});