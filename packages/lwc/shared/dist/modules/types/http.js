/**
 * HTTP-related shared types.
 */
/**
 * Error subclass carrying an HTTP status and optional payload.
 *
 * Throw this from API clients so consumers can `instanceof`-check and access
 * `.status` / `.payload` without unsafe `as` casts.
 */
export class HttpError extends Error {
    constructor(message, status, payload) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
        this.payload = payload;
    }
}
/** Narrow to {@link HttpError} without relying on `instanceof` alone. */
export function isHttpError(err) {
    return (err instanceof HttpError ||
        (err instanceof Error &&
            'status' in err &&
            typeof err.status === 'number'));
}
//# sourceMappingURL=http.js.map