export interface RunStatistics {
    provider: string;
    model: string;
    startedAt: number;
    durationMs: number;
    firstTokenMs: number | null;
    steps: number;
    toolCalls: number;
    toolErrors: number;
    inputTokens: number;
    outputTokens: number;
    compactions: number;
    cancelled: boolean;
}

export function createRunStatistics(provider: string, model: string): RunStatistics {
    return {
        provider,
        model,
        startedAt: Date.now(),
        durationMs: 0,
        firstTokenMs: null,
        steps: 0,
        toolCalls: 0,
        toolErrors: 0,
        inputTokens: 0,
        outputTokens: 0,
        compactions: 0,
        cancelled: false,
    };
}
