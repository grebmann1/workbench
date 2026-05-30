type AnyRecord = Record<string, any>;

export function unwrapExecuteAnonymousResponse(raw: AnyRecord | null | undefined): AnyRecord {
    if (!raw || typeof raw !== 'object') return {};
    return raw.data || raw.response || raw.result || raw;
}

export function hasExecuteAnonymousSignal(raw: AnyRecord | null | undefined): boolean {
    if (!raw || typeof raw !== 'object') return false;
    return (
        'compiled' in raw ||
        'success' in raw ||
        'compileProblem' in raw ||
        'exceptionMessage' in raw ||
        'debugLog' in raw
    );
}

export function normalizeExecuteAnonymousResult(raw: AnyRecord | null | undefined): AnyRecord {
    const unwrapped = unwrapExecuteAnonymousResponse(raw);
    return {
        ...unwrapped,
        compiled: unwrapped.compiled !== false,
        success: unwrapped.success !== false,
        compileProblem: unwrapped.compileProblem || '',
        exceptionMessage: unwrapped.exceptionMessage || '',
        exceptionStackTrace: unwrapped.exceptionStackTrace || '',
        line: Number.isFinite(unwrapped.line) ? unwrapped.line : null,
        column: Number.isFinite(unwrapped.column) ? unwrapped.column : null,
        debugLog: unwrapped.debugLog || '',
    };
}
