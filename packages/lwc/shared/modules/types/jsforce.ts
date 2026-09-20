/**
 * JSforce-compatible connection types.
 *
 * These structural adapters model the capabilities used by Workbench, while
 * reusing the bundled jsforce declarations for native API contracts. Optional
 * capabilities also allow browser bridges and focused test adapters.
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
    then: PromiseLike<{
        records?: T[];
        done?: boolean;
        nextRecordsUrl?: string;
        totalSize?: number;
    }>['then'];
    scanAll?: (value: boolean) => JsforceQueryExecution<T>;
    explain?: ReturnType<import('jsforce').Connection['query']>['explain'];

    records?: T[];
    run: (options: {
        responseTarget: 'Records' | 'SingleRecord' | 'QueryResult';
        autoFetch: boolean;
        maxFetch: number;
    }) => PromiseLike<T[] | null>;
};

/** Shape of `conn.sobject(name).describe()`. */
export type JsforceDescribeSObjectResult = {
    fields: Array<{ name: string; label: string; [key: string]: unknown }>;
    [key: string]: unknown;
};

/** Shape of the jsforce Metadata API available at `conn.metadata`. */
import type * as MetadataStatus from 'jsforce/lib/api/metadata';
type MetadataAsyncResult = { id?: string; asyncProcessId?: string; zipFile?: string };
type MetadataLocator = PromiseLike<MetadataAsyncResult> & {
    on?: (event: string, listener: (result: MetadataAsyncResult) => void) => MetadataLocator;
    poll?: (interval: number, timeout: number) => void;
};
export type JsforceMetadataApi = {
    describe: (version?: string) => Promise<Partial<MetadataStatus.DescribeMetadataResult>>;
    list: (
        queries: unknown[],
        version?: string
    ) => Promise<Partial<MetadataStatus.FileProperties>[]>;
    read: (
        type: string,
        names: string | string[]
    ) => Promise<Record<string, unknown> | Record<string, unknown>[]>;
    retrieve: (options: unknown) => MetadataLocator;
    checkRetrieveStatus: (
        id: string,
        includeZip?: boolean
    ) => Promise<Partial<MetadataStatus.RetrieveResult>>;
    deploy: (zip: string, options: unknown) => MetadataLocator;
    checkDeployStatus: (
        id: string,
        includeDetails?: boolean
    ) => Promise<Partial<MetadataStatus.DeployResult>>;
    _invoke?: import('jsforce').Connection['metadata']['_invoke'];
    pollTimeout?: number;
};

/** Shape of the jsforce Tooling API available at `conn.tooling`. */
export type JsforceToolingApi = {
    describe?: JsforceConnection['describe'];
    describeGlobal?: JsforceConnection['describeGlobal'];
    describeSObject$?: JsforceConnection['describe'];
    sobject?: JsforceConnection['sobject'];
    request?: JsforceConnection['request'];
    cache?: { clear: (key?: string) => void };

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
    describe?: import('jsforce').Connection['describe'];
    describeGlobal?: import('jsforce').Connection['describeGlobal'];
    describeSObject$?: import('jsforce').Connection['describe'];
    soap?: Pick<import('jsforce').Connection['soap'], '_invoke'>;
    dispose?: () => void;
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
    request?: <T = unknown>(
        pathOrOptions: string | JsforceRequestOptions,
        options?: JsforceRequestOptions
    ) => Promise<T>;
    query?: <T = Record<string, unknown>>(soql: string) => JsforceQueryExecution<T>;
    sobject?: (name: string) => Partial<ReturnType<import('jsforce').Connection['sobject']>> & {
        describe: () => Promise<JsforceDescribeSObjectResult>;
    };
    queryMore?: import('jsforce').Connection['queryMore'];
    bulk?: Pick<import('jsforce').Connection['bulk'], 'load'>;
    limitInfo?: import('jsforce').Connection['limitInfo'];
    identity?: () => Promise<Record<string, unknown>>;
    cache?: { clear: (key?: string) => void };
    _callOptions?: Record<string, unknown> & { client?: string };
    _maxSessionRefreshRetries?: number;
    // Escape hatch for undocumented internals.
    [key: string]: unknown;
};
