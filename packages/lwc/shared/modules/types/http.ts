/**
 * HTTP-related shared types.
 */

/** Standard HTTP methods we use. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

/** Generic request options used by the internal fetch helpers. */
export type HttpRequestOptions = {
    method?: HttpMethod | string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
};

/**
 * Error subclass carrying an HTTP status and optional payload.
 *
 * Throw this from API clients so consumers can `instanceof`-check and access
 * `.status` / `.payload` without unsafe `as` casts.
 */
export class HttpError extends Error {
    readonly status: number;
    readonly payload: unknown;

    constructor(message: string, status: number, payload: unknown) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.payload = payload;
    }
}

/** Narrow to {@link HttpError} without relying on `instanceof` alone. */
export function isHttpError(err: unknown): err is HttpError {
    return (
        err instanceof HttpError ||
        (err instanceof Error &&
            'status' in err &&
            typeof (err as { status: unknown }).status === 'number')
    );
}
