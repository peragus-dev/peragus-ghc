#!/usr/bin/env python3
"""
Shared PySD Model for Parallel Simulation
"""

import numpy as np
import pandas as pd
import time
import json
import sys

class ParallelSimulationModel:
    def __init__(self):
        self.components = type('Components', (), {
            '_namespace': {
                'population': 1000,
                'growth_rate': 0.02,
                'carrying_capacity': 10000
            }
        })()
    
    def run(self, initial_condition=None, final_time=1000, time_step=1):
        if initial_condition and isinstance(initial_condition, tuple):
            start_time, initial_values = initial_condition
        else:
            start_time = 0
            initial_values = {}
        
        pop = initial_values.get('population', 1000)
        r = initial_values.get('growth_rate', 0.02)
        K = initial_values.get('carrying_capacity', 10000)
        
        times = np.arange(start_time, final_time + time_step, time_step)
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

def run_scenario(scenario_name, params, iterations=10):
    """Run multiple iterations of a scenario"""
    model = ParallelSimulationModel()
    results = []
    
    print(f"🚀 Container running scenario: {scenario_name}")
    print(f"   Parameters: {params}")
    print(f"   Iterations: {iterations}")
    
    start_time = time.time()
    
    for i in range(iterations):
        iter_start = time.time()
        
        if params:
            result = model.run(initial_condition=(0, params), final_time=1000)
        else:
            result = model.run(final_time=1000)
        
        iter_time = (time.time() - iter_start) * 1000
        
        results.append({
            'iteration': i + 1,
            'final_population': float(result['Population'].iloc[-1]),
            'max_growth': float(result['GrowthRate'].max()),
            'execution_ms': iter_time,
            'data_points': len(result)
        })
        
        if (i + 1) % 5 == 0:
            print(f"   Progress: {i + 1}/{iterations} iterations")
    
    total_time = time.time() - start_time
    
    summary = {
        'scenario': scenario_name,
        'container_id': sys.argv[1] if len(sys.argv) > 1 else 'unknown',
        'parameters': params,
        'iterations': iterations,
        'total_time_seconds': total_time,
        'avg_time_ms': np.mean([r['execution_ms'] for r in results]),
        'avg_final_population': np.mean([r['final_population'] for r in results]),
        'results': results
    }
    
    print(f"✅ Completed {iterations} iterations in {total_time:.2f}s")
    print(f"   Average time per iteration: {summary['avg_time_ms']:.2f}ms")
    print(f"   Average final population: {summary['avg_final_population']:.0f}")
    
    return summary

if __name__ == "__main__":
    # Get scenario from command line
    if len(sys.argv) < 2:
        print("Usage: python shared_model.py <container_id> <scenario>")
        sys.exit(1)
    
    container_id = sys.argv[1]
    scenario = sys.argv[2] if len(sys.argv) > 2 else "baseline"
    
    # Define scenarios
    scenarios = {
        'baseline': ('Baseline Scenario', {}),
        'high_growth': ('High Growth Scenario', {'growth_rate': 0.05}),
        'low_capacity': ('Low Capacity Scenario', {'carrying_capacity': 5000}),
        'stressed': ('Stressed Scenario', {'population': 9000, 'growth_rate': 0.01}),
        'extreme': ('Extreme Growth', {'growth_rate': 0.1, 'carrying_capacity': 50000})
    }
    
    if scenario in scenarios:
        name, params = scenarios[scenario]
        result = run_scenario(name, params, iterations=20)
        
        # Save results
        with open(f'results_{container_id}_{scenario}.json', 'w') as f:
            json.dump(result, f, indent=2)
        
        print(f"\n📊 Results saved to: results_{container_id}_{scenario}.json")
    else:
        print(f"Unknown scenario: {scenario}")
        print(f"Available: {list(scenarios.keys())}")