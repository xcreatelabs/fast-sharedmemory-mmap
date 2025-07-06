'use strict';

const cache = require('../index.js');

const args = process.argv.slice(2);
const command = args[0] || 'help';

console.log('Fast-SHM-Cache Persistence Demo');
console.log('================================\n');

const persistentCache = cache({
  name: 'persistent_cache',
  maxKeys: 100,
  persist: true  // This keeps the shared memory after process exit
});

switch (command) {
  case 'write':
    console.log('Writing data to persistent cache...\n');
    
    // Write some data
    persistentCache.set('app:version', '1.0.0');
    persistentCache.set('app:started', new Date().toISOString());
    persistentCache.set('app:pid', process.pid.toString());
    persistentCache.set('config:database', 'postgresql://localhost/myapp');
    persistentCache.set('config:port', '3000');
    
    // Write some user data
    for (let i = 1; i <= 5; i++) {
      persistentCache.set(`user:${i}:name`, `User ${i}`);
      persistentCache.set(`user:${i}:status`, i % 2 === 0 ? 'active' : 'inactive');
    }
    
    console.log('Data written:');
    console.log(`  Cache size: ${persistentCache.size}`);
    console.log(`  Keys: ${persistentCache.keys().join(', ')}`);
    console.log('\nNow run: node persist-demo.js read');
    console.log('The data will still be available even after this process exits!');
    break;
    
  case 'read':
    console.log('Reading data from persistent cache...\n');
    
    if (persistentCache.size === 0) {
      console.log('No data found in persistent cache.');
      console.log('Run "node persist-demo.js write" first to populate the cache.');
    } else {
      console.log('Found existing data:');
      console.log(`  Cache size: ${persistentCache.size}`);
      console.log(`  App version: ${persistentCache.get('app:version')}`);
      console.log(`  App started: ${persistentCache.get('app:started')}`);
      console.log(`  Original PID: ${persistentCache.get('app:pid')}`);
      console.log(`  Current PID: ${process.pid}`);
      console.log('\nAll entries:');
      
      persistentCache.entries().forEach(([key, value]) => {
        console.log(`  ${key}: ${value}`);
      });
    }
    break;
    
  case 'clear':
    console.log('Clearing persistent cache...\n');
    const sizeBefore = persistentCache.size;
    persistentCache.clear();
    console.log(`  Cleared ${sizeBefore} entries`);
    console.log(`  Cache size now: ${persistentCache.size}`);
    break;
    
  case 'monitor':
    console.log('Monitoring persistent cache (press Ctrl+C to exit)...\n');
    
    const monitor = () => {
      console.clear();
      console.log('Fast-SHM-Cache Monitor');
      console.log('======================');
      console.log(`Time: ${new Date().toISOString()}`);
      console.log(`Size: ${persistentCache.size}`);
      console.log('\nCurrent entries:');
      
      const entries = persistentCache.entries();
      if (entries.length === 0) {
        console.log('  (empty)');
      } else {
        entries.forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      }
      
      console.log('\n(Refreshing every 2 seconds...)');
    };
    
    monitor();
    setInterval(monitor, 2000);
    break;
    
  default:
    console.log('Usage:');
    console.log('  node persist-demo.js write    - Write data to persistent cache');
    console.log('  node persist-demo.js read     - Read data from persistent cache');
    console.log('  node persist-demo.js clear    - Clear the persistent cache');
    console.log('  node persist-demo.js monitor  - Monitor cache in real-time');
    console.log('\nThe persistent cache survives process restarts!');
} 