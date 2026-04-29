import { createStorageMock, type StorageMock } from './storageMock.ts';

type Listener<T = unknown> = (payload: T) => void;

interface EventBus<T = unknown> {
    addListener(l: Listener<T>): void;
    removeListener(l: Listener<T>): void;
    emit(payload: T): void;
    hasListener(l: Listener<T>): boolean;
}

function createEventBus<T = unknown>(): EventBus<T> {
    const listeners = new Set<Listener<T>>();
    return {
        addListener(l) {
            listeners.add(l);
        },
        removeListener(l) {
            listeners.delete(l);
        },
        hasListener(l) {
            return listeners.has(l);
        },
        emit(payload) {
            listeners.forEach(l => l(payload));
        },
    };
}

function toChromeStorageArea(backing: StorageMock) {
    return {
        async get(keys?: string | string[] | Record<string, unknown> | null) {
            if (keys == null) {
                const all: Record<string, unknown> = {};
                for (const k of await backing.keys()) {
                    all[k] = await backing.get(k);
                }
                return all;
            }
            const keyList = Array.isArray(keys)
                ? keys
                : typeof keys === 'string'
                  ? [keys]
                  : Object.keys(keys as Record<string, unknown>);
            const out: Record<string, unknown> = {};
            for (const k of keyList) {
                const v = await backing.get(k);
                if (v !== undefined) out[k] = v;
                else if (typeof keys === 'object' && keys && !Array.isArray(keys)) {
                    const defaults = keys as Record<string, unknown>;
                    out[k] = defaults[k];
                }
            }
            return out;
        },
        async set(items: Record<string, unknown>) {
            for (const [k, v] of Object.entries(items)) {
                await backing.set(k, v);
            }
        },
        async remove(keys: string | string[]) {
            const list = Array.isArray(keys) ? keys : [keys];
            for (const k of list) {
                await backing.remove(k);
            }
        },
        async clear() {
            await backing.clear();
        },
    };
}

export interface ChromeMock {
    chrome: {
        storage: {
            local: ReturnType<typeof toChromeStorageArea>;
            sync: ReturnType<typeof toChromeStorageArea>;
        };
        runtime: {
            sendMessage: (msg: unknown) => Promise<unknown>;
            onMessage: EventBus<{ message: unknown; sendResponse: (r: unknown) => void }>;
            getURL: (path: string) => string;
            id: string;
        };
        tabs: {
            query: (
                q: Record<string, unknown>
            ) => Promise<Array<{ id: number; url: string; active: boolean }>>;
            sendMessage: (tabId: number, msg: unknown) => Promise<unknown>;
        };
    };
    _local: StorageMock;
    _sync: StorageMock;
    reset(): void;
}

interface ChromeMockOptions {
    runtimeHandler?: (msg: unknown) => unknown | Promise<unknown>;
    tabs?: Array<{ id: number; url: string; active: boolean }>;
}

export function createChromeMock(options: ChromeMockOptions = {}): ChromeMock {
    const local = createStorageMock();
    const sync = createStorageMock();
    const onMessage = createEventBus<{ message: unknown; sendResponse: (r: unknown) => void }>();
    let tabs = options.tabs ?? [];

    const chrome = {
        storage: {
            local: toChromeStorageArea(local),
            sync: toChromeStorageArea(sync),
        },
        runtime: {
            async sendMessage(msg: unknown) {
                if (options.runtimeHandler) return options.runtimeHandler(msg);
                return undefined;
            },
            onMessage,
            getURL(path: string) {
                return `chrome-extension://mock-id/${path.replace(/^\//, '')}`;
            },
            id: 'mock-id',
        },
        tabs: {
            async query() {
                return tabs.slice();
            },
            async sendMessage(_tabId: number, _msg: unknown) {
                return undefined;
            },
        },
    };

    return {
        chrome,
        _local: local,
        _sync: sync,
        reset() {
            local._raw.clear();
            sync._raw.clear();
            tabs = options.tabs ?? [];
        },
    };
}
