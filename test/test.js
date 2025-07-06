'use strict';

const assert = require('assert');
const cache = require('../index.js');

console.log('Running fast-shm-cache tests...\n');

// Test 1: Basic set/get operations
{
  console.log('Test 1: Basic set/get operations');
  const c = cache({ name: 'test1', maxKeys: 10 });
  
  assert.strictEqual(c.set('key1', 'value1'), true);
  assert.strictEqual(c.get('key1'), 'value1');
  assert.strictEqual(c.get('nonexistent'), undefined);
  
  console.log('✓ Basic set/get works correctly\n');
}

// Test 2: Type validation
{
  console.log('Test 2: Type validation');
  const c = cache({ name: 'test2' });
  
  assert.throws(() => c.set(123, 'value'), /Key must be a string/);
  assert.throws(() => c.set('key', 123), /Value must be a string/);
  assert.throws(() => c.get(123), /Key must be a string/);
  
  console.log('✓ Type validation works correctly\n');
}

// Test 3: Size limits
{
  console.log('Test 3: Size limits');
  const c = cache({ name: 'test3', maxKeys: 10 });
  
  // Test key size limit (64 bytes)
  const longKey = 'k'.repeat(65);
  assert.strictEqual(c.set(longKey, 'value'), false);
  
  // Test value size limit (256 bytes)
  const longValue = 'v'.repeat(257);
  assert.strictEqual(c.set('key', longValue), false);
  
  // Test within limits
  const validKey = 'k'.repeat(63);
  const validValue = 'v'.repeat(255);
  assert.strictEqual(c.set(validKey, validValue), true);
  assert.strictEqual(c.get(validKey), validValue);
  
  console.log('✓ Size limits enforced correctly\n');
}

// Test 4: Delete operation
{
  console.log('Test 4: Delete operation');
  const c = cache({ name: 'test4' });
  
  c.set('key1', 'value1');
  assert.strictEqual(c.has('key1'), true);
  assert.strictEqual(c.delete('key1'), true);
  assert.strictEqual(c.has('key1'), false);
  assert.strictEqual(c.delete('key1'), false); // Already deleted
  
  console.log('✓ Delete operation works correctly\n');
}

// Test 5: Keys and entries
{
  console.log('Test 5: Keys and entries');
  const c = cache({ name: 'test5' });
  
  c.set('key1', 'value1');
  c.set('key2', 'value2');
  c.set('key3', 'value3');
  
  const keys = c.keys();
  assert.strictEqual(keys.length, 3);
  assert(keys.includes('key1'));
  assert(keys.includes('key2'));
  assert(keys.includes('key3'));
  
  const entries = c.entries();
  assert.strictEqual(entries.length, 3);
  const entryMap = new Map(entries);
  assert.strictEqual(entryMap.get('key1'), 'value1');
  assert.strictEqual(entryMap.get('key2'), 'value2');
  assert.strictEqual(entryMap.get('key3'), 'value3');
  
  console.log('✓ Keys and entries work correctly\n');
}

// Test 6: Size property
{
  console.log('Test 6: Size property');
  const c = cache({ name: 'test6' });
  
  assert.strictEqual(c.size, 0);
  c.set('key1', 'value1');
  assert.strictEqual(c.size, 1);
  c.set('key2', 'value2');
  assert.strictEqual(c.size, 2);
  c.delete('key1');
  assert.strictEqual(c.size, 1);
  c.clear();
  assert.strictEqual(c.size, 0);
  
  console.log('✓ Size property works correctly\n');
}

// Test 7: Clear operation
{
  console.log('Test 7: Clear operation');
  const c = cache({ name: 'test7' });
  
  c.set('key1', 'value1');
  c.set('key2', 'value2');
  assert.strictEqual(c.size, 2);
  
  c.clear();
  assert.strictEqual(c.size, 0);
  assert.strictEqual(c.get('key1'), undefined);
  assert.strictEqual(c.get('key2'), undefined);
  
  console.log('✓ Clear operation works correctly\n');
}

// Test 8: Hash collision handling
{
  console.log('Test 8: Hash collision handling');
  const c = cache({ name: 'test8', maxKeys: 100 });
  
  // Add many keys to test collision handling
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(c.set(`key${i}`, `value${i}`), true);
  }
  
  // Verify all keys are retrievable
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(c.get(`key${i}`), `value${i}`);
  }
  
  assert.strictEqual(c.size, 50);
  
  console.log('✓ Hash collision handling works correctly\n');
}

// Test 9: Cache full scenario
{
  console.log('Test 9: Cache full scenario');
  const c = cache({ name: 'test9', maxKeys: 5 });
  
  // Fill the cache
  for (let i = 0; i < 5; i++) {
    assert.strictEqual(c.set(`key${i}`, `value${i}`), true);
  }
  
  // Try to add one more
  assert.strictEqual(c.set('key5', 'value5'), false);
  assert.strictEqual(c.size, 5);
  
  // Delete one and try again
  c.delete('key0');
  assert.strictEqual(c.set('key5', 'value5'), true);
  assert.strictEqual(c.size, 5);
  
  console.log('✓ Cache full handling works correctly\n');
}

// Test 10: Update existing key
{
  console.log('Test 10: Update existing key');
  const c = cache({ name: 'test10' });
  
  c.set('key1', 'value1');
  assert.strictEqual(c.get('key1'), 'value1');
  assert.strictEqual(c.size, 1);
  
  c.set('key1', 'value2');
  assert.strictEqual(c.get('key1'), 'value2');
  assert.strictEqual(c.size, 1); // Size should remain the same
  
  console.log('✓ Update existing key works correctly\n');
}

console.log('All tests passed! ✅'); 