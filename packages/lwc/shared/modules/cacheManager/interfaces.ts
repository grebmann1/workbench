import { isUndefinedOrNull, safeParseJson, isNotUndefinedOrNull } from 'shared/utils';

type StoreCallback<T = unknown> = (value?: T) => void;

export type StorageStore = {
    getItem: <T = unknown>(key: string, callback?: StoreCallback<T | null>) => Promise<T | null>;
    setItem: (key: string, value: unknown, callback?: StoreCallback) => Promise<void>;
    removeItem: (key: string, callback?: StoreCallback) => Promise<void>;
};

const chromeStore = (variant: 'local' | 'sync' = 'local'): StorageStore => {
    if (variant !== 'local' && variant !== 'sync') {
        throw new Error('Invalid variant');
    }
    if (isUndefinedOrNull(chrome)) {
        throw new Error('Chrome is not available');
    }
    return {
        getItem: function <T = unknown>(key: string, callback?: StoreCallback<T | null>) {
            // Custom implementation here...
            return new Promise<T | null>((resolve, reject) => {
                chrome.storage[variant].get([key], function (result) {
                    const value = result[key] as T | null;
                    if (callback) {
                        callback(value);
                    }
                    resolve(value);
                });
            });
        },
        removeItem: function (key: string, callback?: StoreCallback) {
            // Custom implementation here...
            return new Promise((resolve, reject) => {
                chrome.storage[variant].remove(key, function () {
                    if (callback) {
                        callback();
                    }
                    resolve();
                });
            });
        },
        setItem: function (key: string, value: unknown, callback?: StoreCallback) {
            // Custom implementation here...
            return new Promise((resolve, reject) => {
                chrome.storage[variant].set({ [key]: value }, function () {
                    const lastError = chrome.runtime?.lastError;
                    if (lastError) {
                        const message =
                            typeof lastError.message === 'string' && lastError.message
                                ? lastError.message
                                : 'chrome.storage set failed';
                        reject(new Error(message));
                        return;
                    }
                    if (callback) {
                        callback();
                    }
                    resolve();
                });
            });
        },
    };
};

const basicStore = (variant: 'local' | 'session' = 'local'): StorageStore => {
    if (variant !== 'local' && variant !== 'session') {
        throw new Error('Invalid variant');
    }

    const storage = variant === 'local' ? window.localStorage : window.sessionStorage;

    return {
        getItem: function <T = unknown>(key: string, callback?: StoreCallback<T | null>) {
            const value = storage.getItem(key);
            //console.log('--> getItem <---',key,value);
            const parsedValue = safeParseJson(value) as T | null;
            if (callback) {
                callback(
                    isNotUndefinedOrNull(parsedValue) && parsedValue != 'null' ? parsedValue : null
                ); // 'null' is related to legacy code
            }
            return Promise.resolve(
                isNotUndefinedOrNull(parsedValue) && parsedValue != 'null' ? parsedValue : null
            ); // 'null' is related to legacy code
        },
        setItem: function (key: string, value: unknown, callback?: StoreCallback) {
            try {
                // Web Storage API requires a string value; coerce `null` to the
                // literal "null" so legacy readers that check for it still work.
                storage.setItem(key, value != null ? JSON.stringify(value) : 'null');
                if (callback) {
                    callback();
                }
                return Promise.resolve();
            } catch (error) {
                return Promise.reject(error);
            }
        },
        removeItem: function (key: string, callback?: StoreCallback) {
            storage.removeItem(key);
            if (callback) {
                callback();
            }
            return Promise.resolve();
        },
    };
};

// test
export { chromeStore, basicStore };
