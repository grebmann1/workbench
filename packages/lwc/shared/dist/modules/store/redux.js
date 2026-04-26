import { configureStore } from '@reduxjs/toolkit';
import logger from 'shared/middleware';
import application from './modules/application/reducers';
const isProd = typeof process !== 'undefined' && process.env?.NODE_ENV === 'production';
export const store = configureStore({
    reducer: {
        application,
    },
    middleware: getDefaultMiddleware => isProd ? getDefaultMiddleware() : getDefaultMiddleware().concat(logger),
    devTools: !isProd,
});
//# sourceMappingURL=redux.js.map