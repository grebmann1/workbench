export const IFRAME_JSFORCE_BRIDGE_PROTOCOL = 'sf-toolkit.iframeJsforceBridge';
export const IFRAME_JSFORCE_BRIDGE_VERSION = 1;

export const IFRAME_JSFORCE_BRIDGE_QUERY_FLAG = 'jsforceBridge';
export const IFRAME_JSFORCE_BRIDGE_QUERY_VERSION_PARAM = 'jsforceBridgeProtocolVersion';
export const IFRAME_JSFORCE_BRIDGE_QUERY_PARENT_ORIGIN_PARAM = 'bridgeParentOrigin';

export const IFRAME_JSFORCE_BRIDGE_WINDOW_MESSAGE_TYPES = {
    HELLO: 'bridgeHello',
    PORT: 'bridgePort',
    ERROR: 'bridgeError',
} as const;

export const IFRAME_JSFORCE_BRIDGE_PORT_MESSAGE_TYPES = {
    READY: 'bridgeReady',
    REQUEST: 'jsforceRequest',
    RESPONSE: 'jsforceResponse',
    EVENT: 'bridgeEvent',
    ERROR: 'bridgeError',
} as const;

export const IFRAME_JSFORCE_BRIDGE_METHODS = [
    'connection.getStatus',
    'soql.execute',
    'apex.executeAnonymous',
    'api.execute',
    'apexTests.run',
    'metadata.listTypes',
    'metadata.list',
    'metadata.retrieveViaMetadataApi',
    'metadata.retrieveStart',
    'metadata.checkRetrieveStatus',
    'metadata.retrieveToolingTypes',
    'schema.describeCustomObject',
    'metadata.deployViaToolingApi',
    'metadata.deployViaMetadataApi',
    'metadata.createBundleViaToolingApi',
] as const;

export type IframeJsforceBridgeMethod = (typeof IFRAME_JSFORCE_BRIDGE_METHODS)[number];

export type IframeJsforceBridgeError = {
    code: string;
    message: string;
    // Preserved so auth-error detection survives the port hop: jsforce carries
    // the expired-session signal on `status` (401) and `errorCode`
    // (INVALID_SESSION_ID), which flattening would otherwise drop.
    status?: number;
    errorCode?: string;
};

export type IframeJsforceBridgeHostEvent = {
    eventName: string;
    payload?: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isIframeJsforceBridgeEnvelope(value: unknown): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    return (
        value.protocol === IFRAME_JSFORCE_BRIDGE_PROTOCOL &&
        Number(value.version) === IFRAME_JSFORCE_BRIDGE_VERSION &&
        typeof value.type === 'string'
    );
}

export function isIframeJsforceBridgeMethod(value: unknown): value is IframeJsforceBridgeMethod {
    return (
        typeof value === 'string' &&
        (IFRAME_JSFORCE_BRIDGE_METHODS as readonly string[]).includes(value)
    );
}

export function toIframeJsforceBridgeError(
    error: unknown,
    fallbackCode = 'EUNKNOWN',
    fallbackMessage = 'Bridge operation failed.'
): IframeJsforceBridgeError {
    if (isRecord(error)) {
        const code =
            typeof error.code === 'string' && error.code.trim() ? error.code : fallbackCode;
        const message =
            typeof error.message === 'string' && error.message.trim()
                ? error.message
                : fallbackMessage;
        const normalized: IframeJsforceBridgeError = { code, message };
        if (typeof error.status === 'number') {
            normalized.status = error.status;
        }
        if (typeof error.errorCode === 'string' && error.errorCode.trim()) {
            normalized.errorCode = error.errorCode;
        }
        return normalized;
    }
    if (error instanceof Error) {
        return {
            code: fallbackCode,
            message: error.message || fallbackMessage,
        };
    }
    return {
        code: fallbackCode,
        message: typeof error === 'string' ? error : fallbackMessage,
    };
}
