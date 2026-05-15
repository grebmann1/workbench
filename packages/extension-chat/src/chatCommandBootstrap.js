import { APEX } from 'anonymousApex/slices';
import { API } from 'api/slices';
import { registerCommand } from 'host-api/commands';
import { injectReducer, store } from 'host-api/store';
import { QUERY } from 'soql/slices';

let hasBootstrappedChatCommands = false;

export function bootstrapChatCommands() {
    if (hasBootstrappedChatCommands) {
        return;
    }
    hasBootstrappedChatCommands = true;

    injectReducer('apex', APEX.reduxSlice.reducer);
    injectReducer('api', API.reduxSlice.reducer);
    injectReducer('query', QUERY.reduxSlice.reducer);

    registerCommand('anonymousApex.executeApex', async (payload = {}) => {
        const { connector, body, tabId, isNewTab, createdDate } = payload;
        if (isNewTab) {
            store.dispatch(APEX.reduxSlice.actions.addTab({ tab: { id: tabId, body } }));
        } else if (tabId) {
            store.dispatch(APEX.reduxSlice.actions.selectionTab({ id: tabId }));
            store.dispatch(APEX.reduxSlice.actions.updateBody({ body }));
        }
        const apexPromise = store.dispatch(
            APEX.executeApexAnonymous({
                connector,
                body,
                tabId,
                createdDate: createdDate || Date.now(),
            })
        );
        store.dispatch(APEX.reduxSlice.actions.setAbortingPromise({ tabId, promise: apexPromise }));
        const res = await apexPromise;
        if (tabId) {
            store.dispatch(APEX.reduxSlice.actions.selectionTab({ id: tabId }));
        }
        return res;
    });

    registerCommand('api.executeRequest', async (payload = {}) => {
        const { connector, request, formattedRequest, tabId, isNewTab, tab, createdDate } = payload;
        if (isNewTab && tab) {
            store.dispatch(API.reduxSlice.actions.addTab({ tab }));
        } else if (tabId) {
            store.dispatch(API.reduxSlice.actions.selectionTab({ id: tabId }));
            store.dispatch(
                API.reduxSlice.actions.updateRequest({
                    header: request?.header,
                    method: request?.method,
                    endpoint: request?.endpoint,
                    body: request?.body,
                    tabId,
                })
            );
        }
        const apiPromise = store.dispatch(
            API.executeApiRequest({
                connector,
                request,
                formattedRequest,
                tabId,
                createdDate: createdDate || Date.now(),
            })
        );
        store.dispatch(API.reduxSlice.actions.setAbortingPromise({ tabId, promise: apiPromise }));
        const res = await apiPromise;
        if (tabId) {
            store.dispatch(API.reduxSlice.actions.selectionTab({ id: tabId }));
        }
        return res;
    });

    registerCommand('soql.executeQueryIncognito', async (payload = {}) => {
        const res = await store.dispatch(
            QUERY.executeQueryIncognito({
                connector: payload.connector,
                soql: payload.soql,
                tabId: payload.tabId,
                useToolingApi: payload.useToolingApi,
                includeDeletedRecords: payload.includeDeletedRecords,
            })
        );
        return { payload: res.payload, error: res.error };
    });
}
