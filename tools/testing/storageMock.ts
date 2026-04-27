export interface StorageMock {
    get<T = unknown>(key: string): Promise<T | undefined>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    remove(key: string): Promise<void>;
    clear(): Promise<void>;
    keys(): Promise<string[]>;
    _raw: Map<string, unknown>;
}

export function createStorageMock(initial?: Record<string, unknown>): StorageMock {
    const store = new Map<string, unknown>(
        initial ? Object.entries(initial) : [],
    );
    return {
        _raw: store,
        async get<T>(key: string) {
            return store.has(key) ? (store.get(key) as T) : undefined;
        },
        async set<T>(key: string, value: T) {
            store.set(key, value);
        },
        async remove(key: string) {
            store.delete(key);
        },
        async clear() {
            store.clear();
        },
        async keys() {
            return Array.from(store.keys());
        },
    };
}
