import { generateText, streamText } from 'ai';

import {
    createProviderInstance,
    resolveProviderModelInstance,
    resolveProviderOptions,
} from '../../packages/lwc/main/agent/utils/provider/index.ts';
import { INTERNAL_PROVIDER_BASE_URLS } from '../../packages/lwc/shared/modules/llm/constants.ts';

import { SCENARIOS } from './scenarios.mjs';
import { createJsonlReporter } from './reporters/jsonlReporter.mjs';

export const KEY_ENV = 'WORKBENCH_GATEWAY_KEY';
const REASONING_SUMMARY = 'auto';

type Scenario = (typeof SCENARIOS)[number];

export type HarnessMode = 'streaming' | 'non-streaming';

export type ScenarioSummary = {
    ok: boolean;
    mode: HarnessMode;
    durationMs: number;
    chunkTypes: Record<string, number>;
    textLength: number;
    textDeltaCount: number;
    firstChunkMs: number | null;
    firstTextDeltaMs: number | null;
    lastTextDeltaMs: number | null;
    streamSpreadMs: number;
    firstReasoningDeltaMs: number | null;
    lastReasoningDeltaMs: number | null;
    reasoningSpreadMs: number;
    interDeltaMeanMs: number | null;
    interDeltaP95Ms: number | null;
    charsPerSec: number | null;
    tokensPerSec: number | null;
    promptTokens: number | null;
    completionTokens: number | null;
    sawReasoning: boolean;
    reasoningDeltaCount: number;
    sawToolCall: boolean;
    finishReason?: string;
    usage?: unknown;
    providerMetadata?: unknown;
    errorMessage?: string;
};

// Streaming quality thresholds — only enforced in streaming mode.
const STREAMING_MIN_DELTAS = 3;
const STREAMING_MIN_SPREAD_MS = 150;

function logLine(msg: string) {
    process.stdout.write(msg + '\n');
}

function emptySummary(mode: HarnessMode): ScenarioSummary {
    return {
        ok: false,
        mode,
        durationMs: 0,
        chunkTypes: {},
        textLength: 0,
        textDeltaCount: 0,
        firstChunkMs: null,
        firstTextDeltaMs: null,
        lastTextDeltaMs: null,
        streamSpreadMs: 0,
        firstReasoningDeltaMs: null,
        lastReasoningDeltaMs: null,
        reasoningSpreadMs: 0,
        interDeltaMeanMs: null,
        interDeltaP95Ms: null,
        charsPerSec: null,
        tokensPerSec: null,
        promptTokens: null,
        completionTokens: null,
        sawReasoning: false,
        reasoningDeltaCount: 0,
        sawToolCall: false,
    };
}

function extractTokenCounts(usage: unknown): {
    promptTokens: number | null;
    completionTokens: number | null;
} {
    if (!usage || typeof usage !== 'object') {
        return { promptTokens: null, completionTokens: null };
    }
    const u = usage as Record<string, unknown>;
    const toNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    return {
        promptTokens: toNum(u.inputTokens ?? u.promptTokens ?? u.input_tokens),
        completionTokens: toNum(u.outputTokens ?? u.completionTokens ?? u.output_tokens),
    };
}

function percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
    return sorted[idx];
}

function formatSummary(scenario: Scenario, summary: ScenarioSummary): string {
    const parts: string[] = [];
    parts.push(`[${summary.ok ? 'PASS' : 'FAIL'}] ${scenario.name}`);
    parts.push(`model=${scenario.modelId}`);
    parts.push(`ms=${summary.durationMs}`);
    if (summary.firstChunkMs != null) parts.push(`ttfb=${summary.firstChunkMs}ms`);
    parts.push(`chars=${summary.textLength}`);
    if (summary.mode === 'streaming') {
        parts.push(`deltas=${summary.textDeltaCount}`);
        parts.push(`spread=${summary.streamSpreadMs}ms`);
        if (summary.interDeltaMeanMs != null)
            parts.push(
                `iat=${summary.interDeltaMeanMs}/${summary.interDeltaP95Ms ?? '-'}ms(avg/p95)`
            );
    }
    if (summary.charsPerSec != null) parts.push(`${summary.charsPerSec}ch/s`);
    if (summary.tokensPerSec != null) parts.push(`${summary.tokensPerSec}tok/s`);
    if (summary.promptTokens != null || summary.completionTokens != null) {
        parts.push(`tok=${summary.promptTokens ?? '?'}→${summary.completionTokens ?? '?'}`);
    }
    if (summary.sawReasoning) {
        const extra = summary.reasoningSpreadMs > 0 ? `,${summary.reasoningSpreadMs}ms` : '';
        parts.push(`reasoning(${summary.reasoningDeltaCount}${extra})`);
    }
    if (summary.sawToolCall) parts.push('tools');
    if (summary.finishReason) parts.push(`finish=${summary.finishReason}`);
    if (summary.errorMessage) parts.push(`err="${summary.errorMessage}"`);
    return parts.join(' · ');
}

function computeDerivedMetrics(summary: ScenarioSummary, interDeltaMs: number[]) {
    const { promptTokens, completionTokens } = extractTokenCounts(summary.usage);
    summary.promptTokens = promptTokens;
    summary.completionTokens = completionTokens;

    if (summary.durationMs > 0 && summary.textLength > 0) {
        summary.charsPerSec = Math.round((summary.textLength / summary.durationMs) * 1000);
    }
    if (summary.durationMs > 0 && completionTokens != null && completionTokens > 0) {
        summary.tokensPerSec = Math.round((completionTokens / summary.durationMs) * 1000);
    }

    if (interDeltaMs.length > 0) {
        const mean = interDeltaMs.reduce((a, b) => a + b, 0) / interDeltaMs.length;
        const sorted = [...interDeltaMs].sort((a, b) => a - b);
        summary.interDeltaMeanMs = Math.round(mean);
        summary.interDeltaP95Ms = percentile(sorted, 0.95);
    }
}

function formatPerfTable(
    mode: HarnessMode,
    rows: Array<{ scenario: Scenario; summary: ScenarioSummary }>
): string {
    const lines: string[] = [];
    const header = [
        'scenario'.padEnd(22),
        'dur(ms)'.padStart(8),
        'ttfb'.padStart(7),
        'chars'.padStart(6),
        'tokOut'.padStart(7),
        'ch/s'.padStart(6),
        'tok/s'.padStart(6),
    ];
    if (mode === 'streaming') {
        header.push('deltas'.padStart(7), 'spread'.padStart(8), 'iat(avg/p95)'.padStart(14));
    }
    lines.push(header.join(' │ '));
    lines.push('─'.repeat(header.join(' │ ').length));
    for (const { scenario, summary } of rows) {
        const row = [
            scenario.name.padEnd(22),
            String(summary.durationMs).padStart(8),
            String(summary.firstChunkMs ?? '-').padStart(7),
            String(summary.textLength).padStart(6),
            String(summary.completionTokens ?? '-').padStart(7),
            String(summary.charsPerSec ?? '-').padStart(6),
            String(summary.tokensPerSec ?? '-').padStart(6),
        ];
        if (mode === 'streaming') {
            const iat =
                summary.interDeltaMeanMs != null
                    ? `${summary.interDeltaMeanMs}/${summary.interDeltaP95Ms ?? '-'}`
                    : '-';
            row.push(
                String(summary.textDeltaCount).padStart(7),
                `${summary.streamSpreadMs}ms`.padStart(8),
                iat.padStart(14)
            );
        }
        lines.push(row.join(' │ '));
    }
    return lines.join('\n');
}

function checkExpectations(
    scenario: Scenario,
    summary: ScenarioSummary
): { ok: boolean; reason?: string } {
    if (scenario.expectStreaming && summary.textLength === 0 && !summary.sawToolCall) {
        return { ok: false, reason: 'expected text output but got none' };
    }
    if (summary.mode === 'streaming' && scenario.expectStreaming && !scenario.expectTools) {
        if (summary.textDeltaCount < STREAMING_MIN_DELTAS) {
            return {
                ok: false,
                reason: `not streaming: only ${summary.textDeltaCount} text-delta chunk(s), need ≥${STREAMING_MIN_DELTAS}`,
            };
        }
        // Reasoning models (OpenAI /responses) stream reasoning incrementally
        // then flush final text as a tight burst. Accept the burst as long as
        // *some* channel — reasoning or text — met the streaming spread bar.
        const effectiveSpread = Math.max(summary.streamSpreadMs, summary.reasoningSpreadMs);
        if (effectiveSpread < STREAMING_MIN_SPREAD_MS) {
            return {
                ok: false,
                reason: `not streaming: deltas arrived within ${effectiveSpread}ms, need ≥${STREAMING_MIN_SPREAD_MS}ms`,
            };
        }
    }
    if (scenario.expectReasoning && !summary.sawReasoning) {
        return { ok: false, reason: 'expected reasoning output but saw none' };
    }
    if (scenario.expectTools && !summary.sawToolCall) {
        return { ok: false, reason: 'expected tool-call but saw none' };
    }
    return { ok: true };
}

type RunContext = {
    scenario: Scenario;
    apiKey: string;
    reporter: ReturnType<typeof createJsonlReporter>;
};

function buildCall(scenario: Scenario, apiKey: string) {
    const baseUrl =
        INTERNAL_PROVIDER_BASE_URLS[scenario.provider as keyof typeof INTERNAL_PROVIDER_BASE_URLS];
    if (!baseUrl) {
        throw new Error(`no internal baseUrl configured for provider=${scenario.provider}`);
    }
    const providerInstance = createProviderInstance({
        provider: scenario.provider,
        apiKey,
        baseUrl,
        isInternal: true,
    });
    const model = resolveProviderModelInstance(providerInstance, {
        provider: scenario.provider,
        modelId: scenario.modelId,
        isInternal: true,
    });
    const providerOptions = resolveProviderOptions({
        provider: scenario.provider,
        isInternal: true,
        reasoningConfig: scenario.reasoningEffort
            ? { reasoningEffort: scenario.reasoningEffort, reasoningSummary: REASONING_SUMMARY }
            : undefined,
    });
    return { model, providerOptions };
}

async function runStreamingScenario({
    scenario,
    apiKey,
    reporter,
}: RunContext): Promise<ScenarioSummary> {
    const { model, providerOptions } = buildCall(scenario, apiKey);
    const summary = emptySummary('streaming');
    const start = Date.now();

    const result = streamText({
        model,
        prompt: scenario.prompt,
        tools: scenario.tools,
        providerOptions: providerOptions as any,
        maxRetries: 0,
    });

    let chunkIndex = 0;
    const interDeltaMs: number[] = [];
    let prevDeltaMs: number | null = null;
    try {
        const MEANINGFUL_CHUNKS = new Set([
            'text-delta',
            'reasoning-delta',
            'reasoning',
            'tool-call',
            'tool-input-start',
            'finish',
        ]);
        for await (const chunk of result.fullStream) {
            const elapsed = Date.now() - start;
            reporter.recordChunk(scenario.name, chunkIndex++, elapsed, chunk);
            const type = chunk?.type ?? 'unknown';
            summary.chunkTypes[type] = (summary.chunkTypes[type] ?? 0) + 1;
            // TTFB = first "meaningful" chunk (the AI SDK synthesizes a `start`
            // frame before the request goes out, which would otherwise skew it to ~0).
            if (summary.firstChunkMs === null && MEANINGFUL_CHUNKS.has(type)) {
                summary.firstChunkMs = elapsed;
            }
            if (type === 'text-delta' && typeof (chunk as any).text === 'string') {
                summary.textLength += (chunk as any).text.length;
                summary.textDeltaCount += 1;
                if (summary.firstTextDeltaMs === null) summary.firstTextDeltaMs = elapsed;
                if (prevDeltaMs !== null) interDeltaMs.push(elapsed - prevDeltaMs);
                prevDeltaMs = elapsed;
                summary.lastTextDeltaMs = elapsed;
            }
            if (type === 'reasoning-delta' || type === 'reasoning') {
                summary.sawReasoning = true;
                summary.reasoningDeltaCount += 1;
                if (summary.firstReasoningDeltaMs === null) {
                    summary.firstReasoningDeltaMs = elapsed;
                }
                summary.lastReasoningDeltaMs = elapsed;
            }
            if (type === 'tool-call' || type === 'tool-input-start') {
                summary.sawToolCall = true;
            }
            if (type === 'finish') {
                summary.finishReason = (chunk as any).finishReason;
                summary.usage = (chunk as any).totalUsage ?? (chunk as any).usage;
            }
            // `finish-step` carries providerMetadata (e.g. Google's
            // usageMetadata.thoughtsTokenCount) that we use as a reasoning
            // fallback when the SDK doesn't emit reasoning-delta chunks.
            if (type === 'finish-step' && (chunk as any).providerMetadata) {
                summary.providerMetadata = (chunk as any).providerMetadata;
            }
            if (type === 'error') {
                summary.errorMessage = String(
                    (chunk as any).error?.message ?? (chunk as any).error ?? 'stream error'
                );
            }
        }
    } catch (error) {
        summary.errorMessage = (error as Error)?.message ?? String(error);
        reporter.recordError(scenario.name, error);
    }

    summary.durationMs = Date.now() - start;
    summary.streamSpreadMs =
        summary.firstTextDeltaMs != null && summary.lastTextDeltaMs != null
            ? summary.lastTextDeltaMs - summary.firstTextDeltaMs
            : 0;
    summary.reasoningSpreadMs =
        summary.firstReasoningDeltaMs != null && summary.lastReasoningDeltaMs != null
            ? summary.lastReasoningDeltaMs - summary.firstReasoningDeltaMs
            : 0;
    applyReasoningUsageFallback(summary);
    computeDerivedMetrics(summary, interDeltaMs);
    return summary;
}

async function runNonStreamingScenario({
    scenario,
    apiKey,
    reporter,
}: RunContext): Promise<ScenarioSummary> {
    const { model, providerOptions } = buildCall(scenario, apiKey);
    const summary = emptySummary('non-streaming');
    const start = Date.now();

    try {
        // Single retry in non-streaming mode to absorb transient upstream 5xx
        // flakes from the internal gateway (observed intermittently for
        // Opus-4-7 tool calls). Streaming intentionally keeps maxRetries: 0
        // so we catch wire-shape regressions without masking them.
        const result = await generateText({
            model,
            prompt: scenario.prompt,
            tools: scenario.tools,
            providerOptions: providerOptions as any,
            maxRetries: 1,
        });

        const elapsed = Date.now() - start;
        summary.firstChunkMs = elapsed;
        const text = typeof result.text === 'string' ? result.text : '';
        summary.textLength = text.length;
        summary.finishReason = result.finishReason;
        summary.usage = result.usage;
        summary.providerMetadata = (result as any).providerMetadata;
        summary.chunkTypes[result.finishReason ?? 'unknown'] = 1;

        reporter.recordChunk(scenario.name, 0, elapsed, {
            type: 'text',
            text,
        });

        const reasoning = Array.isArray(result.reasoning) ? result.reasoning : [];
        if (reasoning.length > 0) {
            summary.sawReasoning = true;
            summary.reasoningDeltaCount = reasoning.length;
            reporter.recordChunk(scenario.name, 1, elapsed, {
                type: 'reasoning',
                reasoning,
            });
        }

        const toolCalls = Array.isArray(result.toolCalls) ? result.toolCalls : [];
        if (toolCalls.length > 0) {
            summary.sawToolCall = true;
            reporter.recordChunk(scenario.name, 2, elapsed, {
                type: 'tool-calls',
                toolCalls,
            });
        }
    } catch (error) {
        summary.errorMessage = (error as Error)?.message ?? String(error);
        reporter.recordError(scenario.name, error);
    }

    summary.durationMs = Date.now() - start;
    applyReasoningUsageFallback(summary);
    computeDerivedMetrics(summary, []);
    return summary;
}

// If the SDK never emitted reasoning chunks but provider usage metadata
// shows the model did think, treat that as evidence of reasoning. Today
// this triggers for Gemini preview models via the internal /v1beta gateway,
// which report thoughtsTokenCount but don't surface `thought: true` parts.
function applyReasoningUsageFallback(summary: ScenarioSummary) {
    if (summary.sawReasoning) return;
    const meta = summary.providerMetadata as
        | { google?: { usageMetadata?: { thoughtsTokenCount?: number } } }
        | undefined;
    const thoughts = meta?.google?.usageMetadata?.thoughtsTokenCount;
    if (typeof thoughts === 'number' && thoughts > 0) {
        summary.sawReasoning = true;
    }
}

export async function runHarness(mode: HarnessMode) {
    const apiKey = process.env[KEY_ENV];
    if (!apiKey) {
        logLine(`ERROR: ${KEY_ENV} env var is required. Example:`);
        const cmd =
            mode === 'streaming'
                ? 'npm run test:provider:internal:streaming'
                : 'npm run test:provider:internal:non-streaming';
        logLine(`  ${KEY_ENV}=sk-xxxxx ${cmd}`);
        process.exit(2);
    }

    const reporter = createJsonlReporter(mode);
    logLine(`[harness] mode=${mode}`);
    logLine(`[harness] writing report to ${reporter.path}`);
    logLine(`[harness] running ${SCENARIOS.length} scenarios against internal gateway`);
    logLine('');

    const runScenario = mode === 'streaming' ? runStreamingScenario : runNonStreamingScenario;

    const results: Array<{ scenario: Scenario; summary: ScenarioSummary }> = [];
    for (const scenario of SCENARIOS) {
        logLine(`▶ ${scenario.name} (${scenario.provider}/${scenario.modelId})`);
        let summary: ScenarioSummary;
        try {
            summary = await runScenario({ scenario, apiKey, reporter });
        } catch (error) {
            const message = (error as Error)?.message ?? String(error);
            reporter.recordError(scenario.name, error);
            summary = { ...emptySummary(mode), errorMessage: message };
        }
        const check = checkExpectations(scenario, summary);
        summary.ok = check.ok && !summary.errorMessage;
        if (!check.ok && !summary.errorMessage) {
            summary.errorMessage = check.reason;
        }
        reporter.recordSummary(scenario.name, summary);
        logLine('  ' + formatSummary(scenario, summary));
        results.push({ scenario, summary });
        logLine('');
    }

    await reporter.close();

    const passed = results.filter(r => r.summary.ok).length;
    const failed = results.length - passed;
    logLine('---');
    logLine(`[harness] mode=${mode} performance:`);
    logLine(formatPerfTable(mode, results));
    logLine('---');
    logLine(`[harness] mode=${mode} summary: ${passed} passed, ${failed} failed`);
    logLine(`[harness] report: ${reporter.path}`);

    process.exit(failed === 0 ? 0 : 1);
}
