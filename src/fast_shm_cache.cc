#include <napi.h>
#include <string>
#include <cstring>
#include <atomic>
#include <mutex>
#include <chrono>

#ifdef _WIN32
  #include <windows.h>
#else
  #include <sys/mman.h>
  #include <sys/stat.h>
  #include <fcntl.h>
  #include <unistd.h>
  #include <pthread.h>
#endif

// Constants
const size_t MAX_KEY_SIZE = 64;
const size_t MAX_VALUE_SIZE = 256;
const size_t DEFAULT_MAX_KEYS = 1024;

// Slot structure for the hash table
struct CacheSlot {
    std::atomic<bool> occupied;
    char key[MAX_KEY_SIZE];
    char value[MAX_VALUE_SIZE];
    std::atomic<uint64_t> timestamp;
    pthread_mutex_t mutex;
};

// Shared memory header
struct SharedMemoryHeader {
    size_t max_keys;
    std::atomic<size_t> num_entries;
    pthread_mutex_t global_mutex;
};

class FastShmCache : public Napi::ObjectWrap<FastShmCache> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    FastShmCache(const Napi::CallbackInfo& info);
    ~FastShmCache();

private:
    static Napi::FunctionReference constructor;
    
    void* shm_ptr_;
    size_t shm_size_;
    std::string shm_name_;
    int shm_fd_;
    bool is_creator_;
    bool persist_;
    
    SharedMemoryHeader* header_;
    CacheSlot* slots_;
    
    Napi::Value Set(const Napi::CallbackInfo& info);
    Napi::Value Get(const Napi::CallbackInfo& info);
    Napi::Value Delete(const Napi::CallbackInfo& info);
    Napi::Value Has(const Napi::CallbackInfo& info);
    Napi::Value Keys(const Napi::CallbackInfo& info);
    Napi::Value Entries(const Napi::CallbackInfo& info);
    Napi::Value Clear(const Napi::CallbackInfo& info);
    Napi::Value Size(const Napi::CallbackInfo& info);
    
    uint32_t Hash(const std::string& key);
    bool InitializeSharedMemory(const std::string& name, size_t max_keys, bool persist);
    void CleanupSharedMemory();
};

Napi::FunctionReference FastShmCache::constructor;

// FNV-1a hash function
uint32_t FastShmCache::Hash(const std::string& key) {
    const uint32_t FNV_32_PRIME = 0x01000193;
    uint32_t hash = 0x811c9dc5;
    
    for (char c : key) {
        hash ^= static_cast<uint32_t>(c);
        hash *= FNV_32_PRIME;
    }
    
    return hash;
}

bool FastShmCache::InitializeSharedMemory(const std::string& name, size_t max_keys, bool persist) {
    shm_name_ = "/" + name;
    shm_size_ = sizeof(SharedMemoryHeader) + (max_keys * sizeof(CacheSlot));
    
#ifdef _WIN32
    // Windows implementation using CreateFileMapping
    HANDLE hMapFile = CreateFileMappingA(
        INVALID_HANDLE_VALUE,
        NULL,
        PAGE_READWRITE,
        0,
        shm_size_,
        name.c_str()
    );
    
    is_creator_ = (GetLastError() != ERROR_ALREADY_EXISTS);
    
    shm_ptr_ = MapViewOfFile(
        hMapFile,
        FILE_MAP_ALL_ACCESS,
        0,
        0,
        shm_size_
    );
    
    if (!shm_ptr_) {
        return false;
    }
#else
    // POSIX implementation
    shm_fd_ = shm_open(shm_name_.c_str(), O_CREAT | O_RDWR, 0666);
    if (shm_fd_ == -1) {
        return false;
    }
    
    // Check if we're creating or attaching
    struct stat sb;
    if (fstat(shm_fd_, &sb) == 0 && sb.st_size == 0) {
        is_creator_ = true;
        if (ftruncate(shm_fd_, shm_size_) == -1) {
            close(shm_fd_);
            return false;
        }
    } else {
        is_creator_ = false;
    }
    
    shm_ptr_ = mmap(NULL, shm_size_, PROT_READ | PROT_WRITE, MAP_SHARED, shm_fd_, 0);
    if (shm_ptr_ == MAP_FAILED) {
        close(shm_fd_);
        return false;
    }
#endif
    
    header_ = static_cast<SharedMemoryHeader*>(shm_ptr_);
    slots_ = reinterpret_cast<CacheSlot*>(static_cast<char*>(shm_ptr_) + sizeof(SharedMemoryHeader));
    
    // Initialize if we're the creator
    if (is_creator_) {
        memset(shm_ptr_, 0, shm_size_);
        header_->max_keys = max_keys;
        header_->num_entries.store(0);
        pthread_mutex_init(&header_->global_mutex, NULL);
        
        for (size_t i = 0; i < max_keys; ++i) {
            slots_[i].occupied.store(false);
            pthread_mutex_init(&slots_[i].mutex, NULL);
        }
    }
    
    persist_ = persist;
    
    return true;
}

void FastShmCache::CleanupSharedMemory() {
#ifdef _WIN32
    if (shm_ptr_) {
        UnmapViewOfFile(shm_ptr_);
    }
#else
    if (shm_ptr_ && shm_ptr_ != MAP_FAILED) {
        munmap(shm_ptr_, shm_size_);
    }
    
    if (shm_fd_ != -1) {
        close(shm_fd_);
    }
    
    // Only unlink if we're not persisting and we're the creator
    if (is_creator_ && !shm_name_.empty() && !persist_) {
        shm_unlink(shm_name_.c_str());
    }
#endif
}

FastShmCache::FastShmCache(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<FastShmCache>(info), shm_ptr_(nullptr), shm_fd_(-1), is_creator_(false), persist_(false) {
    
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsObject()) {
        Napi::TypeError::New(env, "Options object required").ThrowAsJavaScriptException();
        return;
    }
    
    Napi::Object options = info[0].As<Napi::Object>();
    
    std::string name = "node_cache";
    size_t max_keys = DEFAULT_MAX_KEYS;
    bool persist = false;
    
    if (options.Has("name") && options.Get("name").IsString()) {
        name = options.Get("name").As<Napi::String>().Utf8Value();
    }
    
    if (options.Has("maxKeys") && options.Get("maxKeys").IsNumber()) {
        max_keys = options.Get("maxKeys").As<Napi::Number>().Uint32Value();
    }
    
    if (options.Has("persist") && options.Get("persist").IsBoolean()) {
        persist = options.Get("persist").As<Napi::Boolean>().Value();
    }
    
    if (!InitializeSharedMemory(name, max_keys, persist)) {
        Napi::Error::New(env, "Failed to initialize shared memory").ThrowAsJavaScriptException();
    }
}

FastShmCache::~FastShmCache() {
    CleanupSharedMemory();
}

Napi::Value FastShmCache::Set(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Expected set(key: string, value: string)").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    std::string key = info[0].As<Napi::String>().Utf8Value();
    std::string value = info[1].As<Napi::String>().Utf8Value();
    
    if (key.length() >= MAX_KEY_SIZE || value.length() >= MAX_VALUE_SIZE) {
        return Napi::Boolean::New(env, false);
    }
    
    uint32_t hash = Hash(key);
    size_t start_index = hash % header_->max_keys;
    
    // Linear probing with wrap-around
    for (size_t i = 0; i < header_->max_keys; ++i) {
        size_t index = (start_index + i) % header_->max_keys;
        CacheSlot& slot = slots_[index];
        
        pthread_mutex_lock(&slot.mutex);
        
        // Check if slot is empty or has the same key
        if (!slot.occupied.load() || strncmp(slot.key, key.c_str(), MAX_KEY_SIZE) == 0) {
            bool was_new = !slot.occupied.load();
            
            strncpy(slot.key, key.c_str(), MAX_KEY_SIZE - 1);
            slot.key[MAX_KEY_SIZE - 1] = '\0';
            
            strncpy(slot.value, value.c_str(), MAX_VALUE_SIZE - 1);
            slot.value[MAX_VALUE_SIZE - 1] = '\0';
            
            slot.timestamp.store(std::chrono::system_clock::now().time_since_epoch().count());
            slot.occupied.store(true);
            
            if (was_new) {
                header_->num_entries.fetch_add(1);
            }
            
            pthread_mutex_unlock(&slot.mutex);
            return Napi::Boolean::New(env, true);
        }
        
        pthread_mutex_unlock(&slot.mutex);
    }
    
    // Hash table is full
    return Napi::Boolean::New(env, false);
}

Napi::Value FastShmCache::Get(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected get(key: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    
    std::string key = info[0].As<Napi::String>().Utf8Value();
    
    if (key.length() >= MAX_KEY_SIZE) {
        return env.Undefined();
    }
    
    uint32_t hash = Hash(key);
    size_t start_index = hash % header_->max_keys;
    
    // Linear probing with wrap-around
    for (size_t i = 0; i < header_->max_keys; ++i) {
        size_t index = (start_index + i) % header_->max_keys;
        CacheSlot& slot = slots_[index];
        
        pthread_mutex_lock(&slot.mutex);
        
        if (slot.occupied.load() && strncmp(slot.key, key.c_str(), MAX_KEY_SIZE) == 0) {
            std::string value(slot.value);
            pthread_mutex_unlock(&slot.mutex);
            return Napi::String::New(env, value);
        }
        
        // If we hit an empty slot, key doesn't exist
        // if (!slot.occupied.load()) {
        //     pthread_mutex_unlock(&slot.mutex);
        //     break;
        // }
        
        pthread_mutex_unlock(&slot.mutex);
    }
    
    return env.Undefined();
}

Napi::Value FastShmCache::Delete(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected delete(key: string)").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    std::string key = info[0].As<Napi::String>().Utf8Value();
    
    if (key.length() >= MAX_KEY_SIZE) {
        return Napi::Boolean::New(env, false);
    }
    
    uint32_t hash = Hash(key);
    size_t start_index = hash % header_->max_keys;
    
    for (size_t i = 0; i < header_->max_keys; ++i) {
        size_t index = (start_index + i) % header_->max_keys;
        CacheSlot& slot = slots_[index];
        
        pthread_mutex_lock(&slot.mutex);
        
        if (slot.occupied.load() && strncmp(slot.key, key.c_str(), MAX_KEY_SIZE) == 0) {
            slot.occupied.store(false);
            memset(slot.key, 0, MAX_KEY_SIZE);
            memset(slot.value, 0, MAX_VALUE_SIZE);
            header_->num_entries.fetch_sub(1);
            pthread_mutex_unlock(&slot.mutex);
            return Napi::Boolean::New(env, true);
        }
        
        // if (!slot.occupied.load()) {
        //     pthread_mutex_unlock(&slot.mutex);
        //     break;
        // }
        
        pthread_mutex_unlock(&slot.mutex);
    }
    
    return Napi::Boolean::New(env, false);
}

Napi::Value FastShmCache::Has(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected has(key: string)").ThrowAsJavaScriptException();
        return Napi::Boolean::New(env, false);
    }
    
    std::string key = info[0].As<Napi::String>().Utf8Value();
    
    if (key.length() >= MAX_KEY_SIZE) {
        return Napi::Boolean::New(env, false);
    }
    
    uint32_t hash = Hash(key);
    size_t start_index = hash % header_->max_keys;
    
    for (size_t i = 0; i < header_->max_keys; ++i) {
        size_t index = (start_index + i) % header_->max_keys;
        CacheSlot& slot = slots_[index];
        
        pthread_mutex_lock(&slot.mutex);
        
        if (slot.occupied.load() && strncmp(slot.key, key.c_str(), MAX_KEY_SIZE) == 0) {
            pthread_mutex_unlock(&slot.mutex);
            return Napi::Boolean::New(env, true);
        }
        
        // if (!slot.occupied.load()) {
        //     pthread_mutex_unlock(&slot.mutex);
        //     break;
        // }
        
        pthread_mutex_unlock(&slot.mutex);
    }
    
    return Napi::Boolean::New(env, false);
}

Napi::Value FastShmCache::Keys(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Array keys = Napi::Array::New(env);
    
    size_t key_index = 0;
    for (size_t i = 0; i < header_->max_keys; ++i) {
        CacheSlot& slot = slots_[i];
        
        pthread_mutex_lock(&slot.mutex);
        if (slot.occupied.load()) {
            keys[key_index++] = Napi::String::New(env, slot.key);
        }
        pthread_mutex_unlock(&slot.mutex);
    }
    
    return keys;
}

Napi::Value FastShmCache::Entries(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::Array entries = Napi::Array::New(env);
    
    size_t entry_index = 0;
    for (size_t i = 0; i < header_->max_keys; ++i) {
        CacheSlot& slot = slots_[i];
        
        pthread_mutex_lock(&slot.mutex);
        if (slot.occupied.load()) {
            Napi::Array pair = Napi::Array::New(env, 2);
            pair[0u] = Napi::String::New(env, slot.key);
            pair[1u] = Napi::String::New(env, slot.value);
            entries[entry_index++] = pair;
        }
        pthread_mutex_unlock(&slot.mutex);
    }
    
    return entries;
}

Napi::Value FastShmCache::Clear(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    pthread_mutex_lock(&header_->global_mutex);
    
    for (size_t i = 0; i < header_->max_keys; ++i) {
        CacheSlot& slot = slots_[i];
        pthread_mutex_lock(&slot.mutex);
        
        if (slot.occupied.load()) {
            slot.occupied.store(false);
            memset(slot.key, 0, MAX_KEY_SIZE);
            memset(slot.value, 0, MAX_VALUE_SIZE);
        }
        
        pthread_mutex_unlock(&slot.mutex);
    }
    
    header_->num_entries.store(0);
    pthread_mutex_unlock(&header_->global_mutex);
    
    return env.Undefined();
}

Napi::Value FastShmCache::Size(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Number::New(env, header_->num_entries.load());
}

Napi::Object FastShmCache::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "FastShmCache", {
        InstanceMethod("set", &FastShmCache::Set),
        InstanceMethod("get", &FastShmCache::Get),
        InstanceMethod("delete", &FastShmCache::Delete),
        InstanceMethod("has", &FastShmCache::Has),
        InstanceMethod("keys", &FastShmCache::Keys),
        InstanceMethod("entries", &FastShmCache::Entries),
        InstanceMethod("clear", &FastShmCache::Clear),
        InstanceMethod("size", &FastShmCache::Size)
    });
    
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    
    exports.Set("FastShmCache", func);
    return exports;
}

// Module initialization function
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return FastShmCache::Init(env, exports);
}

NODE_API_MODULE(fast_shm_cache, InitAll) 