import type { Middleware } from '@reduxjs/toolkit';

const loggerMiddleware: Middleware = store => next => (action: unknown) => {
    const actionType = action && typeof action === 'object' && 'type' in action
        ? (action as { type: string }).type
        : 'unknown';
    console.group(actionType);
    console.info('dispatching', action);

    const result = next(action);

    //console.log('next state', store.getState());
    console.groupEnd();

    return result;
};

export default loggerMiddleware;
