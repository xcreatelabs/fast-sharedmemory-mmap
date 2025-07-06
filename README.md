# fast-sharedmemory-mmap

This is a fork of fast-shm-cache which is no longer available on GitHub.
It includes important fixes for accessing and deleting entries out of order.

# Original README

Most Node.js IPC is embarrassingly slow. We built this because we needed to share data between processes at memory speed, not network speed.

## The Problem

You're running a Node.js cluster. Worker 1 updates a user's session. Worker 2 needs to read it. Your options:
- Redis: ~50k ops/sec, network roundtrip
- Process IPC: ~30k ops/sec, serialization overhead  
- This: ~1.5M ops/sec, direct memory access

The difference matters at scale.

## How It Works

We use POSIX shared memory (`shm_open`/`mmap`) to create a memory region accessible by all processes. A fixed-size hash table lives there. FNV-1a hashing with linear probing for collisions. Fine-grained mutex per slot for thread safety.

No serialization. No network. Just pointers.

```javascript
const cache = require('fast-shm-cache')({
  name: 'prod_cache',
  maxKeys: 10000
});

// Worker 1
cache.set('session:123', 'active');

// Worker 2 sees it instantly
cache.get('session:123'); // 'active'
```

## Performance

Real numbers from a modest Linux box:
- **Writes**: 504,665 ops/sec (1.98μs latency)
- **Reads**: 1,535,150 ops/sec (0.65μs latency)
- **Mixed**: 1,052,518 ops/sec (0.95μs latency)

Compare to traditional IPC: ~30k ops/sec with 33μs latency. We're 51x faster for reads, 16x faster for writes.

## Technical Details

**Memory Layout**:
```
[Header: 40 bytes]
  - max_keys: size_t
  - num_entries: atomic<size_t>
  - global_mutex: pthread_mutex_t

[Slots: N * 336 bytes each]
  - occupied: atomic<bool>
  - key: char[64]
  - value: char[256]  
  - timestamp: atomic<uint64_t>
  - mutex: pthread_mutex_t
```

**Constraints** (by design, not limitation):
- Keys: 64 bytes max
- Values: 256 bytes max
- String only (for now)

These aren't arbitrary. Cache lines are 64 bytes. Keeping data compact means better CPU cache utilization.

## Installation

```bash
npm install fast-shm-cache
```

Requires a C++ compiler. The module builds native bindings on install.

## Use Cases

**Good for**:
- Session stores in clustered apps
- Rate limiting across workers
- Feature flags that update instantly
- Shared configuration
- Any hot data under 256 bytes

**Not for**:
- Large objects (use shared memory directly)
- Persistent storage (it's RAM)
- Complex data structures (just strings)

## API

```javascript
const cache = require('fast-shm-cache')(options);
```

**Options**:
- `name`: Shared memory identifier
- `maxKeys`: Pre-allocated slots (default: 1024)
- `persist`: Survive process restart (default: false)

**Methods**:
- `set(key, value)` → boolean
- `get(key)` → string | undefined
- `delete(key)` → boolean
- `has(key)` → boolean
- `keys()` → string[]
- `clear()` → void

## Real Example: Multi-Process Rate Limiter

```javascript
const cluster = require('cluster');
const cache = require('fast-shm-cache')({ name: 'rate_limits' });

function rateLimit(ip, limit = 100) {
  const key = `rate:${ip}`;
  const count = parseInt(cache.get(key) || '0');
  
  if (count >= limit) return false;
  
  cache.set(key, String(count + 1));
  return true;
}

// Works across all cluster workers
// No Redis needed
```

## Architecture Notes

1. **Hash Function**: FNV-1a chosen for speed and distribution. Roughly 3 cycles per byte on modern CPUs.

2. **Collision Strategy**: Linear probing over chaining. Better cache locality, simpler memory layout.

3. **Locking**: Reader-writer locks would be faster for read-heavy workloads, but pthread_mutex keeps it simple and portable.

4. **Memory Ordering**: Using `std::atomic` with sequential consistency. Overkill? Maybe. But correctness > micro-optimizations.

## Platform Support

- **Linux**: Primary target. Full POSIX shared memory.
- **macOS**: Works via mmap. Some rough edges.
- **Windows**: Experimental. Uses CreateFileMapping.

Linux is where this shines. That's where your production probably runs anyway.

## Benchmarks

Run them yourself:
```bash
node examples/benchmark.js
```

Key insight: We're not magic. The speed comes from eliminating syscalls and copies. Your data goes from process A to process B through physical RAM, not kernel buffers.

## Limitations & Tradeoffs

1. **Fixed size**: No dynamic growth. Allocate what you need upfront.
2. **No expiration**: Build TTL on top if needed.
3. **Local only**: Not distributed. For that, you want Redis.
4. **Crash safety**: Shared memory survives process crashes. Could leave stale data.

## Building From Source

```bash
git clone https://github.com/metabees/fast-shm-cache.git
cd fast-shm-cache
npm install
npm test
```

The C++ is clean, readable. PRs welcome if you see optimizations.

## Why We Built This

We had a Node.js app doing 100k+ requests/second across 32 workers. Redis was the bottleneck. This fixed it.

Sometimes you don't need distributed. Sometimes you just need fast.

## License

MIT. Use it, fork it, sell it. Just don't blame us if it breaks.

## Questions?

The code is small enough to read in an afternoon. Start with `src/fast_shm_cache.cc`. The interesting bits are in `InitializeSharedMemory()` and the hash table implementation.

If you're pushing millions of ops/sec and need something faster, you probably shouldn't be using Node.js.

---

*Built because we needed it. Open sourced because you might too.* 