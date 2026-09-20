interface Window {
    sessionId?: string;
    serverUrl?: string;
    UserContext?: {
        userId?: string;
    };
    $A?: {
        get?: (key: string) => string | undefined;
    };
    localforage?: typeof import('localforage');
    localForage?: typeof import('localforage');
}

declare module 'imported/jsforce' {
    const jsforce: Window['jsforce'];
    export default jsforce;
}
