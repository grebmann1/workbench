type StoreLike = {
    getState: () => unknown;
    subscribe: (listener: () => void) => () => void;
};

export class connectStore {
    dataCallback: (state: unknown) => void;
    store?: StoreLike;
    subscription?: () => void;
    connected = false;

    constructor(dataCallback: (state: unknown) => void) {
        this.dataCallback = dataCallback;
    }

    connect(): void {
        this.connected = true;
        this.subscribeToStore();
    }

    disconnect(): void {
        this.unsubscribeFromStore();
        this.connected = false;
    }

    update(config: { store: StoreLike }): void {
        this.unsubscribeFromStore();
        this.store = config.store;
        this.subscribeToStore();
    }

    subscribeToStore(): void {
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

    unsubscribeFromStore(): void {
        if (this.subscription) {
            this.subscription();
            this.subscription = undefined;
        }
    }
}
