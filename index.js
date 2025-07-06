'use strict';

const binding = require('./build/Release/fast_shm_cache.node');

/**
 * Creates a new shared memory cache instance
 * @param {Object} options - Configuration options
 * @param {string} options.name - Name of the shared memory segment (default: 'node_cache')
 * @param {number} options.maxKeys - Maximum number of keys in the cache (default: 1024)
 * @param {boolean} options.persist - Whether to persist shared memory after process exit (default: false)
 * @returns {Object} Cache instance with get/set/delete/has/keys/entries methods
 */
function createCache(options = {}) {
  const defaults = {
    name: 'node_cache',
    maxKeys: 1024,
    persist: false
  };

  const config = Object.assign({}, defaults, options);
  
  // Validate options
  if (typeof config.name !== 'string' || config.name.length === 0) {
    throw new TypeError('Cache name must be a non-empty string');
  }
  
  if (!Number.isInteger(config.maxKeys) || config.maxKeys < 1) {
    throw new TypeError('maxKeys must be a positive integer');
  }
  
  if (typeof config.persist !== 'boolean') {
    throw new TypeError('persist must be a boolean');
  }

  // Create native cache instance
  const cache = new binding.FastShmCache(config);
  
  // Return public API
  return {
    /**
     * Sets a key-value pair in the cache
     * @param {string} key - Key (max 64 bytes)
     * @param {string} value - Value (max 256 bytes)
     * @returns {boolean} True if successful, false if cache is full or key/value too large
     */
    set(key, value) {
      if (typeof key !== 'string') {
        throw new TypeError('Key must be a string');
      }
      if (typeof value !== 'string') {
        throw new TypeError('Value must be a string');
      }
      return cache.set(key, value);
    },
    
    /**
     * Gets a value by key from the cache
     * @param {string} key - Key to lookup
     * @returns {string|undefined} The value if found, undefined otherwise
     */
    get(key) {
      if (typeof key !== 'string') {
        throw new TypeError('Key must be a string');
      }
      return cache.get(key);
    },
    
    /**
     * Deletes a key-value pair from the cache
     * @param {string} key - Key to delete
     * @returns {boolean} True if deleted, false if not found
     */
    delete(key) {
      if (typeof key !== 'string') {
        throw new TypeError('Key must be a string');
      }
      return cache.delete(key);
    },
    
    /**
     * Checks if a key exists in the cache
     * @param {string} key - Key to check
     * @returns {boolean} True if key exists, false otherwise
     */
    has(key) {
      if (typeof key !== 'string') {
        throw new TypeError('Key must be a string');
      }
      return cache.has(key);
    },
    
    /**
     * Returns all keys in the cache
     * @returns {string[]} Array of keys
     */
    keys() {
      return cache.keys();
    },
    
    /**
     * Returns all key-value pairs in the cache
     * @returns {Array<[string, string]>} Array of [key, value] pairs
     */
    entries() {
      return cache.entries();
    },
    
    /**
     * Clears all entries from the cache
     */
    clear() {
      return cache.clear();
    },
    
    /**
     * Returns the number of entries in the cache
     * @returns {number} Number of entries
     */
    get size() {
      return cache.size();
    },
    
    /**
     * Gets the maximum number of keys
     * @returns {number} Maximum number of keys
     */
    get maxKeys() {
      return config.maxKeys;
    },
    
    /**
     * Gets the cache name
     * @returns {string} Cache name
     */
    get name() {
      return config.name;
    }
  };
}

module.exports = createCache; 