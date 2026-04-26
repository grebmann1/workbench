export class connectStore {
    constructor(dataCallback) {
        this.connected = false;
        this.dataCallback = dataCallback;
    }
    connect() {
        this.connected = true;
        this.subscribeToStore();
    }
    disconnect() {
        this.unsubscribeFromStore();
        this.connected = false;
    }
    update(config) {
        this.unsubscribeFromStore();
        this.store = config.store;
        this.subscribeToStore();
    }
    subscribeToStore() {
        const store = this.store;
        if (this.connected && store) {
            const notifyStateChange = () => {
                const state = store.getState();
                this.dataCallback(state);
            };
            this.subscription = store.subscribe(notifyStateChange);
            notifyStateChange();
        }
    }
    unsubscribeFromStore() {
        if (this.subscription) {
            this.subscription();
            this.subscription = undefined;
        }
    }
}
//# sourceMappingURL=wire-adapter.js.map