type Nullable<T> = T | null | undefined;

export interface MockQueryResult<T = Record<string, unknown>> {
    done: boolean;
    totalSize: number;
    records: T[];
    nextRecordsUrl?: string;
}

export interface ConnectionMockOptions {
    query?: (soql: string) => Promise<MockQueryResult> | MockQueryResult;
    queryMore?: (url: string) => Promise<MockQueryResult> | MockQueryResult;
    describeGlobal?: () => Promise<{ sobjects: Array<{ name: string; label: string }> }>;
    describeSObject?: (name: string) => Promise<{ name: string; fields: unknown[] }>;
    request?: (url: string, init?: unknown) => Promise<unknown>;
    identity?: () => Promise<{ user_id: string; username: string; organization_id: string }>;
    tooling?: {
        query?: (soql: string) => Promise<MockQueryResult> | MockQueryResult;
        sobject?: (name: string) => { describe: () => Promise<{ name: string; fields: unknown[] }> };
        request?: (url: string, init?: unknown) => Promise<unknown>;
    };
    metadata?: {
        list?: (queries: unknown[], version?: string) => Promise<unknown[]>;
        describe?: (version?: string) => Promise<unknown>;
    };
    instanceUrl?: string;
    accessToken?: string;
    version?: string;
}

const emptyQueryResult: MockQueryResult = { done: true, totalSize: 0, records: [] };

export function createConnectionMock(options: ConnectionMockOptions = {}) {
    const {
        query = () => emptyQueryResult,
        queryMore = () => emptyQueryResult,
        describeGlobal = async () => ({ sobjects: [] }),
        describeSObject = async (name: string) => ({ name, fields: [] }),
        request = async () => ({}),
        identity = async () => ({
            user_id: '005000000000000',
            username: 'test@example.com',
            organization_id: '00D000000000000',
        }),
        tooling = {},
        metadata = {},
        instanceUrl = 'https://test.my.salesforce.com',
        accessToken = 'mock-access-token',
        version = '63.0',
    } = options;

    const toolingDefaults = {
        query: tooling.query ?? (() => emptyQueryResult),
        sobject: tooling.sobject ?? ((name: string) => ({ describe: async () => ({ name, fields: [] }) })),
        request: tooling.request ?? (async () => ({})),
    };

    const metadataDefaults = {
        list: metadata.list ?? (async () => []),
        describe: metadata.describe ?? (async () => ({})),
    };

    return {
        query: async (soql: string) => query(soql),
        queryMore: async (url: string) => queryMore(url),
        describeGlobal: async () => describeGlobal(),
        sobject: (name: string) => ({ describe: async () => describeSObject(name) }),
        request: async (url: string, init?: unknown) => request(url, init),
        identity: async () => identity(),
        tooling: toolingDefaults,
        metadata: metadataDefaults,
        instanceUrl,
        accessToken,
        version,
        oauth2: {
            refreshToken: async () => ({ access_token: 'refreshed-token', instance_url: instanceUrl }),
        },
    };
}

export type ConnectionMock = ReturnType<typeof createConnectionMock>;

export interface ConnectorMockOptions {
    conn?: ConnectionMock;
    alias?: string;
    configuration?: Record<string, unknown>;
}

export function createConnectorMock({
    conn = createConnectionMock(),
    alias = 'test-org',
    configuration = {},
}: ConnectorMockOptions = {}) {
    return {
        alias,
        conn,
        configuration: {
            alias,
            instanceUrl: conn.instanceUrl,
            accessToken: conn.accessToken,
            version: conn.version,
            ...configuration,
        },
        frontDoorUrl: () => `${conn.instanceUrl}/secur/frontdoor.jsp?sid=${conn.accessToken}`,
    };
}

export type ConnectorMock = ReturnType<typeof createConnectorMock>;

export function withConnectionOverride<K extends keyof ConnectionMock>(
    conn: ConnectionMock,
    key: K,
    override: ConnectionMock[K],
): ConnectionMock {
    (conn as Record<string, unknown>)[key as string] = override as unknown;
    return conn;
}

export function ignoreUnused(_: Nullable<unknown>) { /* helper to silence unused-var lint in mocks */ }
