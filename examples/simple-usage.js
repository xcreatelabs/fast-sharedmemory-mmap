'use strict';

// Import the fast-shm-cache module
const cache = require('../index.js');

// Create a cache instance
const myCache = cache({
  name: 'my_app_cache',     // Unique name for the shared memory segment
  maxKeys: 1024,            // Maximum number of key-value pairs
  persist: false            // Don't persist after process exit
});

console.log('Fast-SHM-Cache Simple Usage Example');
console.log('===================================\n');

// Basic operations
console.log('1. Setting values:');
myCache.set('user:123', 'John Doe');
myCache.set('session:abc', 'active');
myCache.set('config:timeout', '30');
console.log('   ✓ Added 3 entries\n');

// Getting values
console.log('2. Getting values:');
console.log('   user:123 =', myCache.get('user:123'));
console.log('   session:abc =', myCache.get('session:abc'));
console.log('   config:timeout =', myCache.get('config:timeout'));
console.log('   non-existent =', myCache.get('non-existent'), '\n');

// Checking existence
console.log('3. Checking if keys exist:');
console.log('   has user:123?', myCache.has('user:123'));
console.log('   has invalid?', myCache.has('invalid'), '\n');

// Size and keys
console.log('4. Cache information:');
console.log('   Size:', myCache.size);
console.log('   Max keys:', myCache.maxKeys);
console.log('   Cache name:', myCache.name);
console.log('   All keys:', myCache.keys(), '\n');

// Update existing key
console.log('5. Updating existing key:');
myCache.set('user:123', 'Jane Doe');
console.log('   user:123 now =', myCache.get('user:123'), '\n');

// Delete operation
console.log('6. Deleting keys:');
console.log('   Delete session:abc:', myCache.delete('session:abc'));
console.log('   Size after delete:', myCache.size);
console.log('   Try to get deleted key:', myCache.get('session:abc'), '\n');

// Entries
console.log('7. Getting all entries:');
const entries = myCache.entries();
entries.forEach(([key, value]) => {
  console.log(`   ${key} => ${value}`);
});

// Demonstrating size limits
console.log('\n8. Testing size limits:');
const longKey = 'k'.repeat(65);  // 65 chars (exceeds 64 byte limit)
const longValue = 'v'.repeat(257); // 257 chars (exceeds 256 byte limit)

console.log('   Set with 65-char key:', myCache.set(longKey, 'test'));
console.log('   Set with 257-char value:', myCache.set('test', longValue));
console.log('   Set with valid sizes:', myCache.set('k'.repeat(63), 'v'.repeat(255)));

// Clear the cache
console.log('\n9. Clearing the cache:');
console.log('   Size before clear:', myCache.size);
myCache.clear();
console.log('   Size after clear:', myCache.size);

console.log('\nExample complete!'); 