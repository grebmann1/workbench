/**
 * Enriches the existing Chromium `chrome` object with extension-compatible APIs
 * when the app runs inside the Electron desktop. Chromium already defines a
 * partial `chrome` global; this module adds only what is missing so that
 * extension code works without modification.
 */

if (typeof window !== 'undefined' && window.desktop && typeof chrome !== 'undefined') {
    if (chrome.runtime && !chrome.runtime.getURL) {
        chrome.runtime.getURL = path => {
            const normalized = path.startsWith('/') ? path : `/${path}`;
            return `${window.location.origin}${normalized}`;
        };
    }

    if (!chrome.storage) {
        const makeStore = webStorage => ({
            get(keys, callback) {
                const result = {};
                const allKeys =
                    keys == null
                        ? Object.keys(webStorage)
                        : Array.isArray(keys)
                          ? keys
                          : typeof keys === 'string'
                            ? [keys]
                            : Object.keys(keys);

                for (const key of allKeys) {
                    const raw = webStorage.getItem(key);
                    if (raw !== null) {
                        try {
                            result[key] = JSON.parse(raw);
                        } catch {
                            result[key] = raw;
                        }
                    } else if (
                        keys &&
                        typeof keys === 'object' &&
                        !Array.isArray(keys) &&
                        key in keys
                    ) {
                        result[key] = keys[key];
                    }
                }

                if (callback) {
                    callback(result);
                    return;
                }
                return Promise.resolve(result);
            },

            set(items, callback) {
                for (const [key, value] of Object.entries(items)) {
                    webStorage.setItem(key, JSON.stringify(value));
                }
                if (callback) {
                    callback();
                    return;
                }
                return Promise.resolve();
            },

            remove(keys, callback) {
                for (const key of Array.isArray(keys) ? keys : [keys]) {
                    webStorage.removeItem(key);
                }
                if (callback) {
                    callback();
                    return;
                }
                return Promise.resolve();
            },
        });

        chrome.storage = {
            local: makeStore(localStorage),
            sync: makeStore(localStorage),
            session: makeStore(sessionStorage),
        };
    }
}
