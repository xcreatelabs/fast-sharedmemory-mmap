'use strict';

const cache = require('../index.js');

console.log('Fast-SHM-Cache Performance Benchmark');
console.log('====================================\n');

function benchmark(name, fn, iterations) {
  console.log(`Running ${name}...`);
  
  // Warmup
  for (let i = 0; i < 1000; i++) {
    fn(i);
  }
  
  // Actual benchmark
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn(i);
  }
  const end = process.hrtime.bigint();
  
  const durationMs = Number(end - start) / 1000000;
  const opsPerSec = Math.round(iterations / (durationMs / 1000));
  
  console.log(`  Duration: ${durationMs.toFixed(2)}ms`);
  console.log(`  Operations: ${iterations.toLocaleString()}`);
  console.log(`  Throughput: ${opsPerSec.toLocaleString()} ops/sec`);
  console.log(`  Latency: ${(durationMs / iterations * 1000).toFixed(2)} μs/op\n`);
  
  return opsPerSec;
}

// Create cache instance
const testCache = cache({
  name: 'benchmark_cache',
  maxKeys: 10000,
  persist: false
});

// Clear cache before benchmarking
testCache.clear();

const iterations = 100000;

// Benchmark 1: Sequential writes
const writeOps = benchmark('Sequential Writes', (i) => {
  testCache.set(`key${i % 1000}`, `value${i}`);
}, iterations);

// Benchmark 2: Sequential reads
benchmark('Sequential Reads', (i) => {
  testCache.get(`key${i % 1000}`);
}, iterations);

// Benchmark 3: Mixed read/write (70% read, 30% write)
benchmark('Mixed Operations (70/30)', (i) => {
  if (i % 10 < 7) {
    testCache.get(`key${i % 1000}`);
  } else {
    testCache.set(`key${i % 1000}`, `newvalue${i}`);
  }
}, iterations);

// Benchmark 4: Random access pattern
const randomKeys = Array.from({ length: 1000 }, (_, i) => `randomkey${i}`);
benchmark('Random Access', (i) => {
  const key = randomKeys[Math.floor(Math.random() * randomKeys.length)];
  if (Math.random() < 0.7) {
    testCache.get(key);
  } else {
    testCache.set(key, `randomvalue${i}`);
  }
}, iterations);

// Benchmark 5: has() operations
benchmark('Key Existence Checks', (i) => {
  testCache.has(`key${i % 1000}`);
}, iterations);

// Benchmark 6: delete() operations
benchmark('Delete Operations', (i) => {
  const key = `deletekey${i % 100}`;
  if (i % 2 === 0) {
    testCache.set(key, `value${i}`);
  } else {
    testCache.delete(key);
  }
}, iterations / 2);

// Memory efficiency test
console.log('Memory Efficiency Test');
console.log('----------------------');
testCache.clear();

const maxKeys = 5000;
console.log(`Filling cache with ${maxKeys} entries...`);

const fillStart = process.hrtime.bigint();
for (let i = 0; i < maxKeys; i++) {
  testCache.set(`memtest${i}`, `This is a test value for key ${i}`);
}
const fillEnd = process.hrtime.bigint();

console.log(`  Fill time: ${Number(fillEnd - fillStart) / 1000000}ms`);
console.log(`  Cache size: ${testCache.size}`);
console.log(`  Fill rate: ${Math.round(maxKeys / (Number(fillEnd - fillStart) / 1000000000))} entries/sec\n`);

// Collision test
console.log('Collision Handling Test');
console.log('-----------------------');
testCache.clear();

// Create keys that might hash to similar values
const collisionKeys = Array.from({ length: 100 }, (_, i) => `collision_test_key_${i * 1000}`);
const collisionStart = process.hrtime.bigint();

collisionKeys.forEach((key, i) => {
  testCache.set(key, `collision_value_${i}`);
});

// Verify all keys are retrievable
let verified = 0;
collisionKeys.forEach((key, i) => {
  if (testCache.get(key) === `collision_value_${i}`) {
    verified++;
  }
});

const collisionEnd = process.hrtime.bigint();

console.log(`  Keys inserted: ${collisionKeys.length}`);
console.log(`  Keys verified: ${verified}`);
console.log(`  Success rate: ${(verified / collisionKeys.length * 100).toFixed(2)}%`);
console.log(`  Time: ${Number(collisionEnd - collisionStart) / 1000000}ms\n`);

// Summary
console.log('Summary');
console.log('-------');
console.log(`Write throughput: ${writeOps.toLocaleString()} ops/sec`);
console.log(`Theoretical max throughput: ~1,000,000 ops/sec`);
console.log(`Efficiency: ${(writeOps / 1000000 * 100).toFixed(1)}%\n`);

console.log('Benchmark complete!');

// Cleanup
testCache.clear(); 