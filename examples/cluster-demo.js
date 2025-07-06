'use strict';

const cluster = require('cluster');
const cache = require('../index.js');
const os = require('os');

if (cluster.isMaster) {
  console.log('Fast-SHM-Cache Cluster Demo');
  console.log('===========================\n');
  console.log('This demo shows data sharing between cluster workers using shared memory.\n');
  
  // Fork workers
  const numWorkers = Math.min(4, os.cpus().length);
  
  console.log(`Master ${process.pid} is forking ${numWorkers} workers...`);
  
  // Fork writer worker
  const writer = cluster.fork({ WORKER_TYPE: 'writer' });
  
  // Fork reader workers
  for (let i = 0; i < numWorkers - 1; i++) {
    cluster.fork({ WORKER_TYPE: 'reader', WORKER_ID: i + 1 });
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
  });
  
  // Exit after 10 seconds
  setTimeout(() => {
    console.log('\nDemo complete. Shutting down...');
    process.exit(0);
  }, 10000);
  
} else {
  const sharedCache = cache({
    name: 'cluster_demo',
    maxKeys: 1000,
    persist: false
  });
  
  if (process.env.WORKER_TYPE === 'writer') {
    // Writer worker
    console.log(`[Writer ${process.pid}] Started`);
    
    let counter = 0;
    
    // Write data every 500ms
    const writeInterval = setInterval(() => {
      const timestamp = new Date().toISOString();
      const data = JSON.stringify({
        counter: counter++,
        timestamp: timestamp,
        pid: process.pid
      });
      
      // Store multiple types of data
      sharedCache.set('last_update', timestamp);
      sharedCache.set('counter', counter.toString());
      sharedCache.set('status', 'active');
      sharedCache.set(`data_${counter}`, data);
      
      console.log(`[Writer ${process.pid}] Written:`, {
        counter,
        timestamp,
        cacheSize: sharedCache.size
      });
    }, 500);
    
    // Cleanup on exit
    process.on('SIGTERM', () => {
      clearInterval(writeInterval);
      process.exit(0);
    });
    
  } else if (process.env.WORKER_TYPE === 'reader') {
    // Reader workers
    const workerId = process.env.WORKER_ID;
    console.log(`[Reader ${workerId} - PID ${process.pid}] Started`);
    
    // Read data every 1 second
    const readInterval = setInterval(() => {
      const lastUpdate = sharedCache.get('last_update');
      const counter = sharedCache.get('counter');
      const status = sharedCache.get('status');
      
      if (lastUpdate) {
        console.log(`[Reader ${workerId} - PID ${process.pid}] Read:`, {
          lastUpdate,
          counter,
          status,
          cacheSize: sharedCache.size,
          keys: sharedCache.keys().length
        });
        
        // Try to read specific data entry
        const dataKey = `data_${counter}`;
        const data = sharedCache.get(dataKey);
        if (data) {
          console.log(`[Reader ${workerId} - PID ${process.pid}] Data entry:`, JSON.parse(data));
        }
      } else {
        console.log(`[Reader ${workerId} - PID ${process.pid}] No data available yet`);
      }
    }, 1000);
    
    // Cleanup on exit
    process.on('SIGTERM', () => {
      clearInterval(readInterval);
      process.exit(0);
    });
  }
} 