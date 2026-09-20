import { GOOGLE_DRIVE_SCOPES } from '../googleAuth/constants.js';
import { GOOGLE_FILE_FIELDS, GOOGLE_READ_LIMIT, GOOGLE_TIMEOUT_MS } from './constants';

type GoogleIdentity = {
    getAuthToken(
        options: { interactive: boolean; scopes: string[] },
        callback: (result?: string | { token: string }) => void
    ): void;
    removeCachedAuthToken(options: { token: string }, callback: () => void): void;
};
function identityApi(): GoogleIdentity | undefined {
    return (globalThis as typeof globalThis & { chrome?: { identity?: GoogleIdentity } }).chrome
        ?.identity;
}
export async function getGoogleAccessToken(interactive = false): Promise<string> {
    const identity = identityApi();
    if (!identity?.getAuthToken)
        throw new Error('Google sign-in is available in the Chrome extension.');
    return new Promise((resolve, reject) => {
        identity.getAuthToken({ interactive, scopes: GOOGLE_DRIVE_SCOPES }, result => {
            if (chrome.runtime.lastError || !result)
                reject(
                    new Error(
                        chrome.runtime.lastError?.message ||
                            'Connect Google Workspace in AI settings.'
                    )
                );
            else resolve(typeof result === 'string' ? result : result.token);
        });
    });
}

export type GoogleRequest = { method: 'GET' | 'POST'; url: string; body?: object; text?: boolean };
function required(input: Record<string, unknown>, key: string): string {
    const value = input[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${key} is required.`);
    return value;
}
function id(input: Record<string, unknown>, key: string) {
    const value = required(input, key);
    if (!/^[\w-]+$/.test(value)) throw new Error(`Invalid ${key}. Use the ID, not a URL.`);
    return value;
}
export function buildGoogleRequest(
    operation: string,
    input: Record<string, unknown> = {}
): GoogleRequest {
    const drive = 'https://www.googleapis.com/drive/v3/files';
    const slides = 'https://slides.googleapis.com/v1/presentations';
    switch (operation) {
        case 'drive.listFiles': {
            const query = String(input.query || '')
                .slice(0, 200)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'");
            const params = new URLSearchParams({
                q: `trashed = false${query ? ` and name contains '${query}'` : ''}`,
                pageSize: '30',
                fields: `nextPageToken,files(${GOOGLE_FILE_FIELDS})`,
                orderBy: 'modifiedTime desc',
                supportsAllDrives: 'true',
                includeItemsFromAllDrives: 'true',
            });
            if (typeof input.pageToken === 'string') params.set('pageToken', input.pageToken);
            return { method: 'GET', url: `${drive}?${params}` };
        }
        case 'drive.getFile':
            return {
                method: 'GET',
                url: `${drive}/${id(input, 'fileId')}?fields=${GOOGLE_FILE_FIELDS}&supportsAllDrives=true`,
            };
        case 'drive.copyFile':
            return {
                method: 'POST',
                url: `${drive}/${id(input, 'fileId')}/copy?fields=${GOOGLE_FILE_FIELDS}&supportsAllDrives=true`,
                body: { name: required(input, 'name') },
            };
        case 'drive.exportText':
            return {
                method: 'GET',
                url: `${drive}/${id(input, 'fileId')}/export?mimeType=text%2Fplain`,
                text: true,
            };
        case 'drive.readText':
            return {
                method: 'GET',
                url: `${drive}/${id(input, 'fileId')}?alt=media&supportsAllDrives=true`,
                text: true,
            };
        case 'slides.getPresentation':
            return { method: 'GET', url: `${slides}/${id(input, 'presentationId')}` };
        case 'slides.createPresentation':
            return { method: 'POST', url: slides, body: { title: required(input, 'title') } };
        case 'slides.batchUpdate': {
            if (
                !Array.isArray(input.requests) ||
                !input.requests.length ||
                input.requests.length > 100
            )
                throw new Error('Provide between 1 and 100 Slides API requests.');
            return {
                method: 'POST',
                url: `${slides}/${id(input, 'presentationId')}:batchUpdate`,
                body: {
                    requests: input.requests,
                    ...(input.requiredRevisionId
                        ? {
                              writeControl: {
                                  requiredRevisionId: required(input, 'requiredRevisionId'),
                              },
                          }
                        : {}),
                },
            };
        }
        case 'slides.getThumbnail':
            return {
                method: 'GET',
                url: `${slides}/${id(input, 'presentationId')}/pages/${id(input, 'pageId')}/thumbnail?thumbnailProperties.thumbnailSize=LARGE`,
            };
        default:
            throw new Error(`Unsupported Google Workspace operation: ${operation}`);
    }
}

export async function googleRequest(
    request: GoogleRequest,
    signal?: AbortSignal,
    dependencies = { getToken: getGoogleAccessToken, fetch: globalThis.fetch.bind(globalThis) }
) {
    const url = new URL(request.url);
    if (
        ![
            'https://www.googleapis.com',
            'https://slides.googleapis.com',
            'https://sheets.googleapis.com',
        ].includes(url.origin)
    )
        throw new Error('Unsupported Google API origin.');
    const requestSignal = AbortSignal.any([
        AbortSignal.timeout(GOOGLE_TIMEOUT_MS),
        ...(signal ? [signal] : []),
    ]);
    requestSignal.throwIfAborted();
    const token = await dependencies.getToken(false);
    requestSignal.throwIfAborted();
    const response = await dependencies.fetch(request.url, {
        method: request.method,
        signal: requestSignal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
    });
    if (response.status === 401) {
        const identity = identityApi();
        if (identity?.removeCachedAuthToken)
            await new Promise<void>(resolve => identity.removeCachedAuthToken({ token }, resolve));
        throw new Error('Google access expired. Reconnect Google Workspace in AI settings.');
    }
    if (!response.ok)
        throw new Error(
            `Google Workspace request failed (${response.status}). ${response.status === 403 ? 'Check file access and enable the Drive/Slides API in your Google Cloud project.' : 'Review the request or try again.'}`
        );
    if (request.text) {
        // Bound the download as well as the stored document; never silently index a truncated file.
        const reader = response.body?.getReader();
        if (!reader) return '';
        let bytes = 0;
        let text = '';
        const decoder = new TextDecoder();
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > GOOGLE_READ_LIMIT)
                    throw new Error('Choose a text document smaller than 1 MB.');
                text += decoder.decode(chunk.value, { stream: true });
            }
            return text + decoder.decode();
        } finally {
            await reader.cancel();
        }
    }
    return response.json();
}
export async function executeGoogleOperation(
    operation: string,
    input: Record<string, unknown> = {},
    signal?: AbortSignal
): Promise<unknown> {
    return googleRequest(buildGoogleRequest(operation, input), signal);
}
