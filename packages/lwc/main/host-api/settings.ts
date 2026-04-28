/**
 * Option-provider registry for per-app settings.
 *
 * Declarative settings in an app manifest (`settings[]`) can declare
 * `options: [...]` inline for a static list, or `options: "<providerId>"`
 * to defer to a dynamic provider the app registers at runtime. Apps
 * register from their entry module (same pattern as host-api/commands),
 * and the settings renderer resolves the provider at render time.
 *
 * Provider ids are dotted strings scoped by app id — e.g.
 * `"metadata.storageTypes"` — so collisions stay the owning app's problem.
 *
 * A provider returns (or resolves to) an array of `{ label, value }`
 * objects — the same shape `lightning-combobox` and `lightning-dual-listbox`
 * expect.
 */

const providers = new Map();

export function registerSettingOptionsProvider(id, provider) {
    if (!id || typeof id !== 'string') {
        throw new Error('registerSettingOptionsProvider: id must be a non-empty string');
    }
    if (typeof provider !== 'function') {
        throw new Error(`registerSettingOptionsProvider: provider for "${id}" must be a function`);
    }
    providers.set(id, provider);
    return () => {
        if (providers.get(id) === provider) {
            providers.delete(id);
        }
    };
}

export function hasSettingOptionsProvider(id) {
    return providers.has(id);
}

export async function getSettingOptions(id) {
    const provider = providers.get(id);
    if (!provider) {
        if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn(
                `[host-api/settings] options provider "${id}" is not registered — the app that owns it may not be mounted.`
            );
        }
        return [];
    }
    return await provider();
}

export function __resetSettingOptionsForTests() {
    providers.clear();
}
