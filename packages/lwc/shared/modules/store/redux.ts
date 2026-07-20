import { configureStore } from '@reduxjs/toolkit';
import logger from 'shared/middleware';

import application from './modules/application/reducers';

// Reference the bare `process.env.NODE_ENV` token (no optional chaining) so the
// bundler's `replace` plugin can inline it to a literal at build time; the
// try/catch guards environments where `process` is genuinely undefined.
const resolveIsProd = (): boolean => {
    try {
        return process.env!.NODE_ENV === 'production';
    } catch {
        return false;
    }
};

const isProd = resolveIsProd();

export const store = configureStore({
    reducer: {
        application,
    },
    middleware: getDefaultMiddleware =>
        isProd ? getDefaultMiddleware() : getDefaultMiddleware().concat(logger),
    devTools: !isProd,
});
