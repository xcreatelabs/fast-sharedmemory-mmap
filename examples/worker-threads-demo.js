'use strict';

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const cache = require('../index.js');
const path = require('path');

if (isMainThread) {
  console.log('Fast-SHM-Cache Worker Threads Demo');
  console.log('==================================\n');
  console.log('This demo shows data sharing between worker threads using shared memory.\n');
  
  // Initialize cache in main thread
  const mainCache = cache({
    name: 'worker_threads_demo',
    maxKeys: 500,
    persist: false
  });
  
  // Set initial configuration
  mainCache.set('config:environment', 'production');
  mainCache.set('config:debug', 'false');
  mainCache.set('config:max_connections', '100');
  
  console.log(`[Main Thread] Initial config set, cache size: ${mainCache.size}`);
  
  // Create multiple worker threads
  const workers = [];
  const numWorkers = 3;
  
  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(__filename, {
      workerData: { workerId: i + 1 }
    });
    
    worker.on('message', (msg) => {
      console.log(`[Main Thread] Message from Worker ${msg.workerId}:`, msg.data);
    });
    
    worker.on('error', (err) => {
      console.error(`[Main Thread] Worker error:`, err);
    });
    
    worker.on('exit', (code) => {
      console.log(`[Main Thread] Worker ${i + 1} exited with code ${code}`);
    });
    
    workers.push(worker);
  }
  
  // Main thread operations
  let mainCounter = 0;
  const mainInterval = setInterval(() => {
    mainCounter++;
    
    // Update shared state
    mainCache.set('main:counter', mainCounter.toString());
    mainCache.set('main:timestamp', new Date().toISOString());
    mainCache.set('main:status', mainCounter % 2 === 0 ? 'even' : 'odd');
    
    console.log(`[Main Thread] Updated counter: ${mainCounter}, cache size: ${mainCache.size}`);
    
    // Read worker data
    for (let i = 1; i <= numWorkers; i++) {
      const workerCounter = mainCache.get(`worker${i}:counter`);
      if (workerCounter) {
        console.log(`[Main Thread] Worker ${i} counter: ${workerCounter}`);
      }
    }
  }, 1500);
  
  // Shutdown after 15 seconds
  setTimeout(() => {
    console.log('\n[Main Thread] Shutting down demo...');
    clearInterval(mainInterval);
    
    // Signal workers to exit
    workers.forEach(worker => {
      worker.postMessage({ command: 'exit' });
    });
    
    // Give workers time to cleanup
    setTimeout(() => {
      console.log('[Main Thread] Final cache state:');
      console.log('  Size:', mainCache.size);
      console.log('  Keys:', mainCache.keys());
      process.exit(0);
    }, 1000);
  }, 15000);
  
} else {
  // Worker thread code
  const workerId = workerData.workerId;
  const workerCache = cache({
    name: 'worker_threads_demo',
    maxKeys: 500,
    persist: false
  });
  
  console.log(`[Worker ${workerId}] Started`);
  
  // Read initial configuration
  const config = {
    environment: workerCache.get('config:environment'),
    debug: workerCache.get('config:debug'),
    maxConnections: workerCache.get('config:max_connections')
  };
  
  console.log(`[Worker ${workerId}] Loaded config:`, config);
  
  // Worker operations
  let workerCounter = 0;
  const workerInterval = setInterval(() => {
    workerCounter++;
    
    // Write worker-specific data
    workerCache.set(`worker${workerId}:counter`, workerCounter.toString());
    workerCache.set(`worker${workerId}:timestamp`, new Date().toISOString());
    workerCache.set(`worker${workerId}:status`, 'active');
    
    // Read main thread data
    const mainCounter = workerCache.get('main:counter');
    const mainStatus = workerCache.get('main:status');
    
    if (mainCounter) {
      parentPort.postMessage({
        workerId,
        data: {
          workerCounter,
          mainCounter,
          mainStatus,
          cacheSize: workerCache.size
        }
      });
    }
    
    // Perform some work based on shared state
    if (mainStatus === 'even' && workerCounter % 2 === 0) {
      workerCache.set(`worker${workerId}:special`, 'both-even');
    }
  }, 1000);
  
  // Handle exit command
  parentPort.on('message', (msg) => {
    if (msg.command === 'exit') {
      console.log(`[Worker ${workerId}] Received exit command`);
      clearInterval(workerInterval);
      process.exit(0);
    }
  });
} 