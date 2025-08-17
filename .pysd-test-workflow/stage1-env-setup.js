const path = require('path');

// Import from source files directly since we may have build issues
async function testEnvironmentSetup() {
  console.log('🔧 Stage 1: Setting up PySD environment...');
  
  try {
    // We'll use the Python environment manager directly
    const { PythonEnvironmentManager } = await import('../packages/mcp-server/src/tools/pysd/environment-manager.mts');
    
    const manager = new PythonEnvironmentManager();
    const envPath = '/tmp/.venv/test-workflow-env';
    
    console.log('  Creating virtual environment at:', envPath);
    await manager.initializeEnvironment(envPath);
    
    console.log('  Installing PySD dependencies...');
    await manager.installPySDDependencies(envPath);
    
    console.log('  Verifying installation...');
    const isValid = await manager.verifyPySDInstallation(envPath);
    
    if (!isValid) {
      throw new Error('PySD installation verification failed');
    }
    
    console.log('✅ Stage 1 PASSED: Environment ready at', envPath);
    return { success: true, envPath };
    
  } catch (error) {
    console.error('❌ Stage 1 FAILED:', error.message);
    return { success: false, error: error.message };
  }
}

// Run if executed directly
if (require.main === module) {
  testEnvironmentSetup().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}

module.exports = { testEnvironmentSetup };