import { configureStore, type AnyAction, type Middleware, type Reducer } from '@reduxjs/toolkit';

export interface TestStoreOptions {
    reducers?: Record<string, Reducer>;
    preloadedState?: Record<string, unknown>;
    middlewares?: Middleware[];
}

export interface TestStore {
    store: ReturnType<typeof configureStore>;
    dispatched: AnyAction[];
    reset(): void;
}

export function createTestStore({
    reducers = {},
    preloadedState,
    middlewares = [],
}: TestStoreOptions = {}): TestStore {
    const dispatched: AnyAction[] = [];
    const recorder: Middleware = () => next => action => {
        dispatched.push(action as AnyAction);
        return next(action);
    };
    const finalReducers =
        Object.keys(reducers).length > 0 ? reducers : { _noop: (s: unknown = null) => s };
    const store = configureStore({
        reducer: finalReducers as Record<string, Reducer>,
        preloadedState,
        middleware: getDefault =>
            getDefault({ serializableCheck: false, immutableCheck: false }).concat(
                recorder,
                ...middlewares
            ),
    });
    return {
        store,
        dispatched,
        reset() {
            dispatched.length = 0;
        },
    };
}

export async function waitForState<T>(
    store: { getState: () => unknown; subscribe: (l: () => void) => () => void },
    predicate: (state: unknown) => T | undefined | false,
    { timeoutMs = 500 }: { timeoutMs?: number } = {}
): Promise<T> {
    const initial = predicate(store.getState());
    if (initial) return initial;
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            unsubscribe();
            reject(new Error(`waitForState: predicate did not match within ${timeoutMs}ms`));
        }, timeoutMs);
        const unsubscribe = store.subscribe(() => {
            const result = predicate(store.getState());
            if (result) {
                clearTimeout(timer);
                unsubscribe();
                resolve(result);
            }
        });
    });
}
