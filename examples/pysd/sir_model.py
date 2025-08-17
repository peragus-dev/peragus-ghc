#!/usr/bin/env python3
"""
Simple SIR epidemic model for testing PySD integration
"""
import numpy as np
import pandas as pd

class SIRModel:
    """
    Simple SIR (Susceptible-Infected-Recovered) epidemic model
    """
    
    def __init__(self):
        self.params = {
            'contact_rate': 10,        # contacts per day
            'infectivity': 0.015,      # probability of infection per contact
            'recovery_time': 5,        # days
            'total_population': 1000
        }
    
    def set_components(self, params):
        """Update model parameters"""
        self.params.update(params)
    
    def run(self, return_timestamps=None, initial_time=0, final_time=60, dt=0.125):
        """
        Run the SIR model simulation
        
        Args:
            return_timestamps: Specific times to return results for
            initial_time: Start time of simulation
            final_time: End time of simulation
            dt: Time step
        
        Returns:
            DataFrame with simulation results
        """
        # Use provided timestamps or generate them
        if return_timestamps is not None:
            times = np.array(return_timestamps)
        else:
            times = np.arange(initial_time, final_time + dt, dt)
        
        # Initialize state variables
        S = np.zeros(len(times))
        I = np.zeros(len(times))
        R = np.zeros(len(times))
        
        # Initial conditions
        S[0] = self.params['total_population'] - 1
        I[0] = 1
        R[0] = 0
        
        # Run simulation
        for i in range(1, len(times)):
            # Calculate rates
            infection_rate = (
                self.params['contact_rate'] * 
                self.params['infectivity'] * 
                S[i-1] * I[i-1] / 
                self.params['total_population']
            )
            recovery_rate = I[i-1] / self.params['recovery_time']
            
            # Update states
            S[i] = max(0, S[i-1] - infection_rate * dt)
            I[i] = max(0, I[i-1] + (infection_rate - recovery_rate) * dt)
            R[i] = max(0, R[i-1] + recovery_rate * dt)
        
        # Return as DataFrame
        return pd.DataFrame({
            'Time': times,
            'Susceptible': S,
            'Infected': I,
            'Recovered': R
        }).set_index('Time')
    
    def doc(self):
        """Return model documentation"""
        return {
            "description": "SIR epidemic model",
            "parameters": self.params,
            "units": {
                "contact_rate": "1/Day",
                "infectivity": "Dimensionless",
                "recovery_time": "Day",
                "total_population": "Person"
            }
        }

# Create model instance for PySD compatibility
model = SIRModel()

if __name__ == "__main__":
    # Test the model
    print("Testing SIR Model...")
    results = model.run(final_time=30)
    
    print("\nModel Parameters:")
    for key, value in model.params.items():
        print(f"  {key}: {value}")
    
    print("\nSimulation Results Summary:")
    print(f"  Time points: {len(results)}")
    print(f"  Peak infected: {results['Infected'].max():.0f} people")
    print(f"  Peak time: Day {results['Infected'].idxmax():.1f}")
    
    print("\nFinal State:")
    final = results.iloc[-1]
    print(f"  Susceptible: {final['Susceptible']:.0f}")
    print(f"  Infected: {final['Infected']:.0f}")
    print(f"  Recovered: {final['Recovered']:.0f}")