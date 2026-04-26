import { configureStore, combineReducers, type Reducer } from '@reduxjs/toolkit';

type StaticReducers = Record<string, Reducer>;

/**
 * Wrap `configureStore` with dynamic slice injection. Core passes the static
 * reducer map + a configure callback (for middleware/devtools wiring);
 * extensions later call `injectReducer(key, reducer)` to mount their own
 * slice without modifying core. Collisions with a static key throw —
 * extensions cannot override host state.
 *
 * The configure callback receives the combined static reducer and must
 * return the fully-built store. Keeping `configureStore` at the call site
 * preserves RTK's precise type inference for `RootState` and middleware
 * tuples — proxying through a generic options bag collapses both.
 */
export function createInjectableStore<
    S extends StaticReducers,
    Store extends { getState: () => unknown; replaceReducer: (r: Reducer) => void },
>(staticReducers: S, configure: (rootReducer: ReturnType<typeof combineReducers<S>>) => Store) {
    const dynamicReducers: StaticReducers = {};
    const combinedStatic = combineReducers(staticReducers);
    const store = configure(combinedStatic);

    function rebuild() {
        const combined = combineReducers({ ...staticReducers, ...dynamicReducers });
        store.replaceReducer(combined as Reducer);
    }

    function injectReducer(key: string, reducer: Reducer): () => void {
        if (!key || typeof key !== 'string') {
            throw new Error('injectReducer: key must be a non-empty string');
        }
        if (typeof reducer !== 'function') {
            throw new Error(`injectReducer: reducer for "${key}" must be a function`);
        }
        if (Object.prototype.hasOwnProperty.call(staticReducers, key)) {
            throw new Error(
                `injectReducer: key "${key}" is reserved by a core slice and cannot be overridden.`
            );
        }
        if (
            process.env.NODE_ENV !== 'production' &&
            Object.prototype.hasOwnProperty.call(dynamicReducers, key)
        ) {
            // eslint-disable-next-line no-console
            console.warn(`[store] injectReducer: key "${key}" already injected; replacing.`);
        }
        dynamicReducers[key] = reducer;
        rebuild();
        return () => removeReducer(key);
    }

    function removeReducer(key: string): void {
        if (!Object.prototype.hasOwnProperty.call(dynamicReducers, key)) return;
        delete dynamicReducers[key];
        rebuild();
    }

    return { store, injectReducer, removeReducer };
}

export { configureStore };
