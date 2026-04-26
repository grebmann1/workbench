const loggerMiddleware = store => next => (action) => {
    const actionType = action && typeof action === 'object' && 'type' in action
        ? action.type
        : 'unknown';
    console.group(actionType);
    console.info('dispatching', action);
    const result = next(action);
    //console.log('next state', store.getState());
    console.groupEnd();
    return result;
};
export default loggerMiddleware;
//# sourceMappingURL=middleware.js.map