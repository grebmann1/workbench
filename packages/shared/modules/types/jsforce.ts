/**
 * JSforce-compatible connection types.
 *
 * These types describe the shape of a jsforce `Connection` object as used across
 * the codebase. jsforce does not ship its own TypeScript types in this project,
 * so we maintain this minimal surface area to stay correct and lint-clean.
 */

/** Minimal OAuth2 shape used by jsforce Connection. */
export type JsforceOAuth2 = {
    refreshToken?: (token: string) => Promise<Record<string, unknown>>;
};

/** Options passed to `connection.request()`. */
export type JsforceRequestOptions = {
    method?: string;
    url?: string;
    body?: string;
    headers?: Record<string, string>;
};

/** Shape of a jsforce QueryExecution returned by `conn.query()`/`conn.tooling.query()`. */
export type JsforceQueryExecution<T = Record<string, unknown>> = {
    records?: T[];
    run: (options: {
        responseTarget: 'Records' | 'SingleRecord' | 'QueryResult';
        autoFetch: boolean;
        maxFetch: number;
    }) => Promise<T[] | null>;
};

/** Shape of `conn.sobject(name).describe()`. */
export type JsforceDescribeSObjectResult = {
    fields: Array<{ name: string; label: string; [key: string]: unknown }>;
    [key: string]: unknown;
};

/** Shape of the jsforce Metadata API available at `conn.metadata`. */
export type JsforceMetadataApi = {
    describe: (asOfVersion?: string) => Promise<unknown>;
    list: (queries: unknown[], asOfVersion?: string) => Promise<unknown[]>;
    retrieve: (
        options: unknown
    ) => Promise<{ id?: string; asyncProcessId?: string; zipFile?: string }>;
    checkRetrieveStatus: (id: string, includeZip?: boolean) => Promise<unknown>;
    deploy: (
        zipB64: string,
        options: unknown
    ) => Promise<{ id?: string; asyncProcessId?: string; zipFile?: string }>;
    checkDeployStatus: (id: string, includeDetails?: boolean) => Promise<unknown>;
};

/** Shape of the jsforce Tooling API available at `conn.tooling`. */
export type JsforceToolingApi = {
    query: <T = Record<string, unknown>>(soql: string) => JsforceQueryExecution<T>;
    executeAnonymous?: (script: string) => Promise<{ exceptionMessage?: string }>;
};

/**
 * Structural type for a jsforce `Connection` instance.
 *
 * We intentionally keep this loose (`[key: string]: unknown`) because the real
 * jsforce Connection has many fields we don't model explicitly, and consumers
 * occasionally reach into undocumented internals (e.g. `_callOptions`).
 */
export type JsforceConnection = {
    accessToken?: string;
    instanceUrl?: string;
    version?: string;
    refreshToken?: string;
    userInfo?: Record<string, unknown>;
    alias?: string;
    oauth2?: JsforceOAuth2;
    tooling?: JsforceToolingApi;
    metadata?: JsforceMetadataApi;
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    /**
     * jsforce `request` supports both a string path and a descriptor object.
     * The descriptor form is the richer variant we use across the codebase.
     */
    request?: (
        pathOrOptions: string | JsforceRequestOptions,
        options?: JsforceRequestOptions
    ) => Promise<unknown>;
    query?: <T = Record<string, unknown>>(soql: string) => JsforceQueryExecution<T>;
    sobject?: (name: string) => {
        describe: () => Promise<JsforceDescribeSObjectResult>;
        [key: string]: unknown;
    };
    identity?: () => Promise<Record<string, unknown>>;
    _callOptions?: Record<string, unknown> & { client?: string };
    _maxSessionRefreshRetries?: number;
    // Escape hatch for undocumented internals.
    [key: string]: unknown;
};
