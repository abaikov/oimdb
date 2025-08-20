#!/usr/bin/env node

// Test script to verify the build works
console.log('Testing build...\n');

try {
  // Test CommonJS
  console.log('Testing CommonJS build...');
  const { OIMGreeter: CJSGreeter } = require('../dist/index.cjs');
  const cjsGreeter = new CJSGreeter('CommonJS works!');
  cjsGreeter.greet();
  
  // Test ESM (if available)
  console.log('\nTesting ESM build...');
  const { OIMGreeter: ESMGreeter } = await import('../dist/index.js');
  const esmGreeter = new ESMGreeter('ESM works!');
  esmGreeter.greet();
  
  console.log('\n✅ Build test passed!');
} catch (error) {
  console.error('\n❌ Build test failed:', error.message);
  process.exit(1);
}
