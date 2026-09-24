import { memoryContext } from '../memory/memory';
import { createMemoryTools } from '../memory/tools';
import { createGoogleWorkspaceTools } from '../googleWorkspace/tools';
import type { ToolCall as AiToolCall, ToolResultOutput } from '@ai-sdk/provider-utils';
import type { Store } from '@reduxjs/toolkit';
import { clearCdpHandlerForConversation, ensureCdpHandlerInitialized } from 'agent/cdpHandler';
import {
    type CompactionSettings,
    createCompactionSummaryMessage,
    DEFAULT_KEEP_RECENT_TOKENS,
    DEFAULT_RESERVE_TOKENS,
    estimateConversationTokens,
    generateCompactionSummary,
    prepareCompaction,
    relaxCompactionSettings,
    shouldCompactContext,
} from 'agent/compaction';
import {
    cleanupBashInstanceForConversation,
    getOrCreateBashInstanceForConversation,
} from 'agent/runtimeDeps';
import { createStreamMessageBuilder } from 'agent/streamBuilder';
import { StepCheckpoint } from '../runController/stepCheckpoint';
import { createRunStatistics, type RunStatistics } from '../runController/runStatistics';
import type { ConnectorLike } from 'core/connector';
import { approveToolCall, type ToolApprovalMode } from '../tools/modules/toolPolicy';
import { createBashTools, filterToolsByModel } from 'agent/tools';
import {
    DEFAULT_MODEL,
    DEFAULT_REASONING,
    createProviderInstance,
    getSummaryModelForAgentProvider,
    getReasoningConfigFromSelection,
    isAbortLikeError,
    isContextOverflowError,
    extractNestedErrorMessage,
    normalizeToolInputSchema,
    cloneMessageForStreaming,
    normalizeModelMessages,
    sanitizeIncompleteToolExchanges,
    discoverSkills,
    formatSkillsForPrompt,
    resolveProviderModelInstance,
    resolveProviderOptions,
    persistRefreshedOAuthCredentials,
    type ProviderInstance,
} from 'agent/utils';
import { stepCountIs, streamText, tool as createAiSdkTool } from 'ai';
import type { ModelMessage, ToolModelMessage, ToolResultPart, ToolSet } from 'ai';
import { getIndexedDbFileSystem } from 'core/fs';
import { store, AGENT } from 'core/store';
import {
    DEFAULT_LLM_PROVIDER,
    normalizeLlmProvider,
    getMaxOutputTokensForModel,
    getContextWindowForModel,
    type OAuthCredentials,
} from 'shared/llm';
import LOGGER from 'shared/logger';
import { guid } from 'shared/utils';
import { z } from 'zod';

import { createMcpToolset } from '../mcp/mcpManager';
import type { McpServerConfig, McpToolset } from '../mcp/mcpTypes';

const MAX_TOOL_ROUNDS = 400;

export type {
    ProcessMessageFinishReason,
    ProcessMessageUsage,
    ProcessMessageStepStart,
    ProcessMessageStepFinish,
    ToolCall,
    ToolResult,
    ProcessMessageToolStart,
    ProcessMessageToolFinish,
    ProcessMessageError,
    ProcessMessageObserver,
    StreamChunk,
} from './type';
import type {
    ProcessMessageFinishReason,
    ProcessMessageUsage,
    ToolCall,
    ToolResult,
    ProcessMessageObserver,
    StreamChunk,
} from './type';

type AgentSettings = {
    approvalMode?: ToolApprovalMode;
    signal?: AbortSignal;
    connector?: ConnectorLike | null;
    provider?: string;
    apiKey?: string;
    baseUrl?: string;
    selectedModel?: string;
    selectedReasoning?: string;
    modelContextWindow?: number;
    systemPrompt?: string;
    maxToolRounds?: number;
    isStoreEnabled?: boolean;
    isInternal?: boolean;
    useResponsesApi?: boolean;
    authMode?: 'apiKey' | 'oauth';
    oauth?: OAuthCredentials | null;
    extraTools?: Array<{
        name: string;
        description?: string;
        parameters?: unknown;
        execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
    }>;
    brightDataApiKey?: string | null;
    googleSheetEnabled?: boolean;
    memoryQuery?: string;
    mcpServers?: McpServerConfig[];
    store: Store;
};

type SubagentStatus = {
    agent: string;
    description: string;
    detail?: string;
};

let cachedSkillsSection: Promise<string> | null = null;

async function resolveSkillsSection() {
    if (!cachedSkillsSection) {
        cachedSkillsSection = (async () => {
            const skills = await discoverSkills();
            const skillsText = formatSkillsForPrompt(skills);
            return skillsText ? `\n\n${skillsText}\n` : '';
        })();
    }
    return cachedSkillsSection;
}

function refreshSkillsCache() {
    cachedSkillsSection = null;
}
function toAiSdkTools(
    tools,
    extraContext: {
        conversationId?: string;
        abortSignal?: AbortSignal;
        approvalContext?: string;
        approvalMode?: ToolApprovalMode;
    } = {}
) {
    const result = {};
    (Array.isArray(tools) ? tools : []).forEach(rawTool => {
        if (
            !rawTool ||
            typeof rawTool !== 'object' ||
            typeof rawTool.name !== 'string' ||
            typeof rawTool.execute !== 'function'
        ) {
            return;
        }
        result[rawTool.name] = createAiSdkTool({
            ...rawTool,
            description: rawTool.description || '',
            inputSchema: normalizeToolInputSchema(rawTool.parameters, z),
            execute: async (input: object, options) => {
                const signals = [extraContext.abortSignal, options.abortSignal].filter(
                    Boolean
                ) as AbortSignal[];
                const abortSignal = signals.length ? AbortSignal.any(signals) : undefined;
                abortSignal?.throwIfAborted();
                await approveToolCall(
                    rawTool.name,
                    input,
                    extraContext.conversationId || '',
                    abortSignal,
                    extraContext.approvalContext,
                    extraContext.approvalMode
                );
                abortSignal?.throwIfAborted();
                return rawTool.execute({ ...input, ...extraContext, abortSignal });
            },
        });
    });
    return result;
}

function finalizeMessageForDisplay(message: ModelMessage): ModelMessage {
    if (!message || typeof message !== 'object') return message;
    if (!Array.isArray((message as any).content)) return message;
    const content = (message as any).content;
    const finalizedContent = content.map(part => {
        if (!part || typeof part !== 'object') return part;
        if (part.type === 'reasoning') {
            if (part.state !== 'done') {
                return { ...part, state: 'done' };
            }
            return part;
        }
        if (part.type === 'tool-call') {
            const { state, ...rest } = part;
            const providerOptions = getToolCallProviderOptions(rest);
            return providerOptions ? { ...rest, providerOptions } : rest;
        }
        if (part.type === 'tool-result') {
            /* if (!part.state) {
                const isError = part.result?.success === false || part.output?.success === false;
                return { ...part, state: isError ? 'output-error' : 'output-available' };
            } */
            return part;
        }
        return part;
    });
    return { ...message, content: finalizedContent };
}

export class Agent {
    private static streamingMessageListenersByConversation = new Map(); // conversationId -> Set<callback>
    private static agentMap = new Map<string, Agent>(); // conversationId -> Agent

    public conversationId: string;
    public systemPrompt: string;

    private providerInstance: ProviderInstance;
    private provider: string;
    private isStoreEnabled: boolean;
    private store: Store;
    private model: string;
    private summaryModel: string;
    private tools: ToolSet;
    private reasoningConfig?: { reasoningEffort: string; reasoningSummary: string };
    private modelContextWindow: number;
    private modelMaxOutputTokens: number;
    private maxToolRounds: number;
    private abortController: AbortController | null = null;
    private parentSignal?: AbortSignal;
    private disposed = false;
    private statistics: RunStatistics | null = null;
    public warnings: string[] = [];
    get runStatistics() {
        return this.statistics ? { ...this.statistics } : null;
    }
    private messages: ModelMessage[] = [];
    private planContext: string | null = null;
    private isInternal: boolean;
    private useResponsesApi: boolean;
    private authMode?: 'apiKey' | 'oauth';
    private mcpToolset: McpToolset | null;
    private subagentStatusListeners = new Set<(status: SubagentStatus | null) => void>();
    private _lastContextStats: {
        contextWindow: number;
        usedTokens: number;
        remainingTokens: number;
        ratioUsed: number;
        ratioRemaining: number;
        preCompactionTokens: number;
    } | null = null;

    private constructor({
        conversationId,
        providerInstance,
        provider,
        model,
        summaryModel,
        messages,
        tools,
        reasoningConfig,
        modelContextWindow,
        modelMaxOutputTokens,
        systemPrompt,
        maxToolRounds,
        isStoreEnabled,
        isInternal,
        useResponsesApi,
        authMode,
        mcpToolset,
        store,
    }: {
        conversationId: string;
        providerInstance: ProviderInstance;
        provider: string;
        model: string;
        summaryModel: string;
        messages: ModelMessage[];
        tools: ToolSet;
        reasoningConfig?: { reasoningEffort: string; reasoningSummary: string };
        modelContextWindow: number;
        modelMaxOutputTokens: number;
        systemPrompt: string;
        maxToolRounds: number;
        isStoreEnabled: boolean;
        isInternal?: boolean;
        useResponsesApi?: boolean;
        authMode?: 'apiKey' | 'oauth';
        mcpToolset?: McpToolset | null;
        store: Store;
    }) {
        this.conversationId = conversationId;
        this.messages = normalizeModelMessages(messages);
        this.providerInstance = providerInstance;
        this.provider = provider;
        this.model = model;
        this.summaryModel = summaryModel;
        this.tools = tools;
        this.reasoningConfig = reasoningConfig;
        this.modelContextWindow = modelContextWindow;
        this.modelMaxOutputTokens = modelMaxOutputTokens;
        this.systemPrompt = systemPrompt;
        this.maxToolRounds = maxToolRounds;
        this.isStoreEnabled = isStoreEnabled;
        this.isInternal = !!isInternal;
        this.useResponsesApi = !!useResponsesApi;
        this.authMode = authMode;
        this.mcpToolset = mcpToolset || null;
        this.store = store;
    }

    static async create({
        messages = [],
        conversationId,
        settings,
    }: {
        messages?: ModelMessage[];
        conversationId?: string;
        settings: AgentSettings;
    }) {
        const id = conversationId || guid();
        settings.signal?.throwIfAborted();
        let mcpToolset: McpToolset | null = null;
        try {
            const shell = getOrCreateBashInstanceForConversation(id);
            const sandboxDeps = {
                getBashInstance: () => shell,
                brightDataApiKey: settings.brightDataApiKey ?? null,
                googleSheetEnabled: settings.googleSheetEnabled ?? false,
            };
            await ensureCdpHandlerInitialized(id, sandboxDeps);
            settings.signal?.throwIfAborted();
            const fs = getIndexedDbFileSystem();

            const bashTools = createBashTools(shell, fs, {
                execInSandbox: async (code, timeoutMs) => {
                    const handler = await ensureCdpHandlerInitialized(id, sandboxDeps);
                    if (!handler || typeof handler.execInSandbox !== 'function') {
                        throw new Error('Browser runtime is unavailable');
                    }
                    return handler.execInSandbox(code, timeoutMs);
                },
                brightDataApiKey: settings.brightDataApiKey ?? null,
                connector: settings.connector,
                signal: settings.signal,
            });
            const currentModel = settings.selectedModel || DEFAULT_MODEL;
            const availableTools = [
                ...bashTools,
                ...createMemoryTools(fs, {
                    orgId: settings.connector?.configuration?.orgId,
                    alias: settings.connector?.configuration?.alias,
                }),
                ...(settings.googleSheetEnabled ? createGoogleWorkspaceTools() : []),
                ...(Array.isArray(settings.extraTools) ? settings.extraTools : []),
            ];
            const filteredTools = filterToolsByModel(availableTools, currentModel);
            const aiTools = toAiSdkTools(filteredTools, {
                conversationId: id,
                abortSignal: settings.signal,
                approvalContext: settings.connector?.conn?.instanceUrl || '',
                approvalMode: settings.approvalMode,
            });
            mcpToolset = await createMcpToolset(settings.mcpServers ?? []);
            settings.signal?.throwIfAborted();
            Object.assign(aiTools, mcpToolset.tools);
            for (const name of Object.keys(mcpToolset.tools)) {
                const definition = aiTools[name];
                const execute = definition.execute;
                if (!execute) continue;
                aiTools[name] = {
                    ...definition,
                    execute: async (input, options) => {
                        const signals = [settings.signal, options.abortSignal].filter(
                            Boolean
                        ) as AbortSignal[];
                        const abortSignal = signals.length ? AbortSignal.any(signals) : undefined;
                        await approveToolCall(
                            name,
                            input,
                            id,
                            abortSignal,
                            '',
                            settings.approvalMode
                        );
                        abortSignal?.throwIfAborted();
                        return execute(input, { ...options, abortSignal });
                    },
                };
            }
            if (mcpToolset.errors.length) {
                LOGGER.warn('[agent:mcp] MCP toolset initialized with errors', {
                    errors: mcpToolset.errors,
                });
            }
            const reasoningConfig = getReasoningConfigFromSelection(
                settings.selectedReasoning || DEFAULT_REASONING
            );
            const provider = normalizeLlmProvider(settings.provider || DEFAULT_LLM_PROVIDER);
            const providerInstance = createProviderInstance({
                provider,
                apiKey: settings.apiKey,
                baseUrl: settings.baseUrl,
                isInternal: !!settings.isInternal,
                authMode: settings.authMode,
                oauth: settings.oauth,
                onTokenRefresh:
                    settings.authMode === 'oauth'
                        ? credentials => {
                              // Fire-and-forget: the in-memory token already keeps this run going;
                              // persistence just keeps the next run + a rotated refresh token fresh.
                              persistRefreshedOAuthCredentials(provider, credentials).catch(
                                  error => {
                                      LOGGER.warn(
                                          '[agent:oauth] failed to persist refreshed credentials',
                                          {
                                              error,
                                          }
                                      );
                                  }
                              );
                          }
                        : undefined,
            });
            const summaryModel = getSummaryModelForAgentProvider(
                provider,
                currentModel,
                !!settings.isInternal
            );

            const agent = new Agent({
                messages,
                conversationId: id,
                providerInstance,
                provider,
                model: currentModel,
                summaryModel,
                tools: aiTools,
                reasoningConfig,
                modelContextWindow:
                    settings.modelContextWindow || getContextWindowForModel(currentModel),
                modelMaxOutputTokens: getMaxOutputTokensForModel(currentModel),
                systemPrompt:
                    (settings.systemPrompt || '') +
                    (await memoryContext(
                        fs,
                        {
                            orgId: settings.connector?.configuration?.orgId,
                            alias: settings.connector?.configuration?.alias,
                        },
                        settings.memoryQuery || JSON.stringify(messages.slice(-2))
                    ).catch(error => {
                        LOGGER.warn('[agent] Memory recall unavailable', error);
                        return '\nMemory could not be loaded. Do not claim to remember earlier preferences. Use read_memory to retry.\n';
                    })),
                maxToolRounds: settings.maxToolRounds || MAX_TOOL_ROUNDS,
                isStoreEnabled: settings.isStoreEnabled || false,
                isInternal: settings.isInternal,
                useResponsesApi: settings.useResponsesApi,
                authMode: settings.authMode,
                mcpToolset,
                store: settings.store,
            });
            agent.parentSignal = settings.signal;
            agent.warnings = mcpToolset.errors.map(
                error =>
                    `MCP server ${error.serverId} is unavailable. Review its connection in AI settings.`
            );
            return agent;
        } catch (error) {
            await mcpToolset?.close();
            clearCdpHandlerForConversation(id);
            throw error;
        }
    }

    abort(): void {
        this.abortController?.abort();
        this.emitSubagentStatus(null);
        clearCdpHandlerForConversation(this.conversationId);
        this.closeMcpToolset().catch(error => {
            LOGGER.warn('[agent:mcp] failed to close MCP clients after abort', { error });
        });
    }

    get contextStats() {
        return this._lastContextStats;
    }

    get modelInfo() {
        return {
            id: this.model,
            contextWindow: this.modelContextWindow,
            supportsMaxOutputTokens: true,
        };
    }

    get messageCount() {
        return this.messages.length;
    }

    getMessages() {
        return [...this.messages];
    }

    get lastMessageRole() {
        return this.messages[this.messages.length - 1]?.role ?? null;
    }

    setPlanContext(ctx: string | null): void {
        this.planContext = ctx;
    }

    static refreshSkills(): void {
        refreshSkillsCache();
    }

    static emitStreamingMessage(conversationId: string, message: ModelMessage | null): void {
        if (!conversationId) return;
        const listeners = Agent.streamingMessageListenersByConversation.get(conversationId);
        if (!listeners || listeners.size === 0) return;
        const next = message ? cloneMessageForStreaming(message) : null;
        listeners.forEach(listener => {
            try {
                listener(next);
            } catch (_) {
                // Ignore listener errors to avoid breaking stream fan-out.
            }
        });
    }

    static subscribeStreamingMessage(
        conversationId: string,
        listener: (message: ModelMessage | null) => void
    ): () => void {
        if (!conversationId || typeof listener !== 'function') {
            return () => {};
        }
        const listeners =
            Agent.streamingMessageListenersByConversation.get(conversationId) || new Set();
        listeners.add(listener);
        Agent.streamingMessageListenersByConversation.set(conversationId, listeners);
        return () => {
            const current = Agent.streamingMessageListenersByConversation.get(conversationId);
            if (!current) return;
            current.delete(listener);
            if (current.size === 0) {
                Agent.streamingMessageListenersByConversation.delete(conversationId);
            }
        };
    }

    static clearStreamingMessageForConversation(conversationId: string): void {
        Agent.emitStreamingMessage(conversationId, null);
    }

    static clearStreamingMessageListenersForConversation(conversationId: string): void {
        Agent.streamingMessageListenersByConversation.delete(conversationId);
    }

    static registerAgent(conversationId: string, agent: Agent): void {
        if (!conversationId || !agent) return;
        Agent.agentMap.set(conversationId, agent);
    }

    static unregisterAgent(conversationId: string): void {
        if (!conversationId) return;
        Agent.agentMap.delete(conversationId);
    }

    static stopAgent(conversationId: string): void {
        if (!conversationId) return;
        const agent = Agent.agentMap.get(conversationId);
        if (agent) {
            try {
                agent.abort();
            } catch (_) {
                // Best effort: stop agent without throwing.
            }
            Agent.unregisterAgent(conversationId);
        }
        Agent.clearStreamingMessageForConversation(conversationId);
    }

    static cleanupConversationResources(conversationId: string): void {
        const running = Agent.agentMap.get(conversationId);
        if (running) running.disposed = true;
        Agent.stopAgent(conversationId);
        Agent.clearStreamingMessageListenersForConversation(conversationId);
        cleanupBashInstanceForConversation(conversationId);
        clearCdpHandlerForConversation(conversationId);
        Agent.unregisterAgent(conversationId);
    }

    private async closeMcpToolset(): Promise<void> {
        const mcpToolset = this.mcpToolset;
        this.mcpToolset = null;
        if (!mcpToolset) {
            return;
        }
        await mcpToolset.close();
    }

    onSubagentStatus(listener: (status: SubagentStatus | null) => void): () => void {
        this.subagentStatusListeners.add(listener);
        return () => {
            this.subagentStatusListeners.delete(listener);
        };
    }

    private getCompactionSettings(): CompactionSettings {
        return {
            reserveTokens: Math.min(
                DEFAULT_RESERVE_TOKENS,
                Math.floor(this.modelContextWindow * 0.25)
            ),
            keepRecentTokens: Math.min(
                DEFAULT_KEEP_RECENT_TOKENS,
                Math.floor(this.modelContextWindow * 0.25)
            ),
        };
    }

    private async compactForContext(
        system: string,
        contextWindow: number,
        signal: AbortSignal,
        settings = this.getCompactionSettings(),
        force = false
    ): Promise<boolean> {
        const preparation = prepareCompaction(this.messages, system, settings);
        if (!preparation) return false;
        if (!force && !shouldCompactContext(preparation.tokensBefore, contextWindow, settings)) {
            return false;
        }

        if (this.isStoreEnabled && this.store) {
            this.store.dispatch(
                AGENT.reduxSlice.actions.startSummarizing({ id: this.conversationId })
            );
        }
        let summary: string | null = null;
        try {
            summary = await generateCompactionSummary(
                this.providerInstance,
                this.provider,
                this.summaryModel,
                preparation,
                undefined,
                signal,
                this.isInternal
            );
        } finally {
            if (this.isStoreEnabled && this.store) {
                this.store.dispatch(
                    AGENT.reduxSlice.actions.stopSummarizing({ id: this.conversationId })
                );
            }
        }
        if (!summary) {
            throw new Error(
                'Context summarization returned no summary; conversation history was preserved.'
            );
        }

        this.messages = [createCompactionSummaryMessage(summary), ...preparation.keptMessages];
        if (this.statistics) this.statistics.compactions++;
        return true;
    }

    async *processMessage(
        userMessages: ModelMessage[],
        observer?: ProcessMessageObserver
    ): AsyncGenerator<StreamChunk, void, unknown> {
        Agent.registerAgent(this.conversationId, this);
        this.statistics = createRunStatistics(this.provider, this.model);
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        const onAbort = () => this.abort();
        this.parentSignal?.addEventListener('abort', onAbort, { once: true });
        const streamBuilder = createStreamMessageBuilder(message =>
            Agent.emitStreamingMessage(this.conversationId, message)
        );
        let completedStepMessages: ModelMessage[] = [];
        let toolStarted = false;

        this.messages = sanitizeIncompleteToolExchanges(this.messages);
        this.messages.push(...userMessages);
        let systemText = '';
        let attemptedOverflowRecovery = false;
        try {
            if (this.parentSignal?.aborted) this.abort();
            signal.throwIfAborted();
            systemText = await buildSystemPrompt(
                this.systemPrompt,
                this.planContext,
                this.conversationId
            );
            this.planContext = null;
            while (true) {
                try {
                    signal.throwIfAborted();
                    const checkpoint = new StepCheckpoint();
                    const compactionSettings = attemptedOverflowRecovery
                        ? relaxCompactionSettings(this.getCompactionSettings())
                        : this.getCompactionSettings();

                    const preCompactionTokens = estimateConversationTokens(
                        systemText,
                        this.messages
                    );
                    const didCompact = await this.compactForContext(
                        systemText,
                        this.modelContextWindow,
                        signal,
                        compactionSettings,
                        attemptedOverflowRecovery
                    );
                    const tokensAfter = estimateConversationTokens(systemText, this.messages);

                    this._lastContextStats = {
                        contextWindow: this.modelContextWindow,
                        usedTokens: tokensAfter,
                        remainingTokens: Math.max(0, this.modelContextWindow - tokensAfter),
                        ratioUsed: tokensAfter / this.modelContextWindow,
                        ratioRemaining: 1 - tokensAfter / this.modelContextWindow,
                        preCompactionTokens,
                    };

                    LOGGER.debug('[agent] processMessage', {
                        compactionSettings,
                        preCompactionTokens,
                        didCompact,
                    });

                    const result = streamText({
                        model: resolveProviderModelInstance(this.providerInstance, {
                            provider: this.provider,
                            modelId: this.model,
                            isInternal: this.isInternal,
                            useResponsesApi: this.useResponsesApi,
                            authMode: this.authMode,
                        }),
                        system: systemText,
                        messages: [...this.messages],
                        tools: this.tools,
                        stopWhen: stepCountIs(this.maxToolRounds),
                        maxRetries: 0,
                        maxOutputTokens: Math.min(
                            this.modelMaxOutputTokens,
                            Math.floor(this.modelContextWindow * 0.25)
                        ),
                        abortSignal: signal,
                        providerOptions: resolveProviderOptions({
                            provider: this.provider,
                            reasoningConfig: this.reasoningConfig,
                            isInternal: this.isInternal,
                        }),
                        experimental_onStepStart: (event: unknown) => {
                            notifyObserver(observer?.onStepStart, {
                                stepNumber: getStepNumber(event, 0),
                                timestamp: Date.now(),
                            });
                        },
                        onStepFinish: (event: unknown) => {
                            const usage = getUsage(event);
                            this.statistics.steps++;
                            this.statistics.inputTokens += usage.inputTokens || 0;
                            this.statistics.outputTokens += usage.outputTokens || 0;
                            notifyObserver(observer?.onStepFinish, {
                                stepNumber: getStepNumber(event, 0),
                                timestamp: Date.now(),
                                finishReason: getFinishReason(event),
                                usage: getUsage(event),
                            });
                            const stepMessages = Array.isArray((event as any)?.response?.messages)
                                ? (event as any).response.messages
                                : [];
                            if (stepMessages.length > 0) {
                                completedStepMessages = stepMessages;
                                this.appendCompletedTurn(checkpoint.takeNewMessages(stepMessages));
                            }
                        },
                        onError: (event: unknown) => {
                            const message = extractNestedErrorMessage(
                                (event as { error?: unknown })?.error ?? event
                            );
                            notifyObserver(observer?.onError, {
                                message: String(message),
                                timestamp: Date.now(),
                            });
                            throw new Error(message);
                        },
                    });

                    for await (const part of result.fullStream) {
                        const partType = (part as { type?: string })?.type;
                        if (signal.aborted) {
                            const cancelledChunk = {
                                type: 'content',
                                content: '\n\n[Cancelled]',
                            } as StreamChunk;
                            streamBuilder.handleChunk(cancelledChunk);
                            yield cancelledChunk;
                            break;
                        }

                        switch (partType) {
                            case 'reasoning-start':
                                streamBuilder.startReasoning();
                                break;
                            case 'reasoning-end':
                                streamBuilder.finalizeReasoning(true);
                                break;
                            case 'text-delta':
                                {
                                    if (this.statistics.firstTokenMs === null)
                                        this.statistics.firstTokenMs =
                                            Date.now() - this.statistics.startedAt;
                                    const chunk = {
                                        type: 'content',
                                        content: (part as any).text,
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            case 'reasoning-delta':
                                {
                                    const chunk = {
                                        type: 'reasoning',
                                        content: (part as any).text,
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            case 'tool-call': {
                                toolStarted = true;
                                this.statistics.toolCalls++;
                                const tc = toToolCall(part as any);
                                notifyObserver(observer?.onToolStart, {
                                    toolCall: tc,
                                    timestamp: Date.now(),
                                });
                                {
                                    const chunk = {
                                        type: 'tool_calls',
                                        toolCalls: [tc],
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            }
                            case 'tool-call-delta':
                            case 'tool-input-delta': {
                                const toolCallId = normalizeToolCallId(part);
                                const toolName = normalizeToolName(part);
                                const delta = extractToolCallDelta(part);
                                if (toolCallId) {
                                    const chunk = {
                                        type: 'tool_call_delta',
                                        toolCallId,
                                        toolName,
                                        delta,
                                        providerOptions: getToolCallProviderOptions(part as any),
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            }
                            case 'tool-call-streaming-start':
                            case 'tool-input-start': {
                                const toolCallId = normalizeToolCallId(part);
                                const toolName = normalizeToolName(part);
                                if (toolCallId) {
                                    const chunk = {
                                        type: 'tool_call_delta',
                                        toolCallId,
                                        toolName,
                                        delta: '',
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            }
                            case 'tool-input-end':
                                break;
                            case 'tool-result': {
                                const toolResultPart = part as any;
                                const tc: ToolCall = {
                                    toolCallId: toolResultPart.toolCallId,
                                    toolName: toolResultPart.toolName,
                                    input: toolResultPart.input ?? {},
                                };
                                const tr = toToolResult(toolResultPart.output);
                                notifyObserver(observer?.onToolFinish, {
                                    toolCall: tc,
                                    toolResult: tr,
                                    timestamp: Date.now(),
                                });
                                {
                                    const chunk = {
                                        type: 'tool_result',
                                        toolCall: tc,
                                        toolResult: tr,
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            }
                            case 'error': {
                                const message = extractNestedErrorMessage((part as any).error);
                                notifyObserver(observer?.onError, {
                                    message,
                                    timestamp: Date.now(),
                                });
                                {
                                    const chunk = {
                                        type: 'error',
                                        content: message,
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                            }
                            case 'tool-error': {
                                this.statistics.toolErrors++;
                                const failed = part as {
                                    toolCallId: string;
                                    toolName: string;
                                    input: unknown;
                                    error: unknown;
                                };
                                const chunk: StreamChunk = {
                                    type: 'tool_result',
                                    toolCall: {
                                        toolCallId: failed.toolCallId,
                                        toolName: failed.toolName,
                                        input: failed.input,
                                    },
                                    toolResult: {
                                        type: 'error-text',
                                        value: extractNestedErrorMessage(failed.error),
                                    },
                                };
                                streamBuilder.handleChunk(chunk);
                                yield chunk;
                                break;
                            }
                            case 'abort':
                                {
                                    const chunk = {
                                        type: 'content',
                                        content: '\n\n[Cancelled]',
                                    } as StreamChunk;
                                    streamBuilder.handleChunk(chunk);
                                    yield chunk;
                                }
                                break;
                        }
                    }

                    if (signal.aborted) {
                        const doneChunk = { type: 'done' } as StreamChunk;
                        streamBuilder.handleChunk(doneChunk);
                        yield doneChunk;
                        return;
                    }

                    try {
                        const response = await result.response;
                        if (!signal.aborted) {
                            this.appendCompletedTurn(checkpoint.takeNewMessages(response.messages));
                        }
                    } catch (responseError: unknown) {
                        LOGGER.error('[agent] processMessage responseError', {
                            isContextOverflowError: isContextOverflowError(responseError),
                        });
                        if (
                            !toolStarted &&
                            !completedStepMessages.length &&
                            !attemptedOverflowRecovery &&
                            isContextOverflowError(responseError)
                        ) {
                            attemptedOverflowRecovery = true;
                            continue;
                        }
                        throw responseError;
                    }

                    if (signal.aborted) {
                        const doneChunk = { type: 'done' } as StreamChunk;
                        streamBuilder.handleChunk(doneChunk);
                        yield doneChunk;
                        return;
                    }
                    {
                        const doneChunk = { type: 'done' } as StreamChunk;
                        streamBuilder.handleChunk(doneChunk);
                        yield doneChunk;
                    }
                    return;
                } catch (err: unknown) {
                    if (signal.aborted) {
                        const cancelledChunk = {
                            type: 'content',
                            content: '\n\n[Cancelled]',
                        } as StreamChunk;
                        streamBuilder.handleChunk(cancelledChunk);
                        yield cancelledChunk;
                        const doneChunk = { type: 'done' } as StreamChunk;
                        streamBuilder.handleChunk(doneChunk);
                        yield doneChunk;
                        return;
                    }
                    if (
                        !toolStarted &&
                        !completedStepMessages.length &&
                        !attemptedOverflowRecovery &&
                        isContextOverflowError(err)
                    ) {
                        attemptedOverflowRecovery = true;
                        continue;
                    }

                    const msg =
                        isContextOverflowError(err) && toolStarted
                            ? 'Context limit reached after tool execution. Completed work was saved. Send a follow-up to continue.'
                            : extractNestedErrorMessage(err);
                    notifyObserver(observer?.onError, {
                        message: `Error: ${msg}`,
                        timestamp: Date.now(),
                    });
                    {
                        const errorChunk = {
                            type: 'error',
                            content: `Error: ${msg}`,
                        } as StreamChunk;
                        streamBuilder.handleChunk(errorChunk);
                        yield errorChunk;
                    }
                    {
                        const doneChunk = { type: 'done' } as StreamChunk;
                        streamBuilder.handleChunk(doneChunk);
                        yield doneChunk;
                    }
                    return;
                }
            }
        } catch (error) {
            if (signal.aborted) return;
            throw error;
        } finally {
            this.parentSignal?.removeEventListener('abort', onAbort);
            this.statistics.durationMs = Date.now() - this.statistics.startedAt;
            this.statistics.cancelled = signal.aborted;
            if (this.abortController?.signal === signal) {
                this.abortController = null;
            }
            try {
                if (!this.disposed && this.isStoreEnabled && this.store) {
                    this.store.dispatch(
                        AGENT.reduxSlice.actions.setContextMessages({
                            id: this.conversationId,
                            messages: [...this.messages],
                        })
                    );
                }
                await this.closeMcpToolset();
            } finally {
                const current = Agent.agentMap.get(this.conversationId);
                if (!current || current === this) {
                    Agent.unregisterAgent(this.conversationId);
                    Agent.clearStreamingMessageForConversation(this.conversationId);
                    clearCdpHandlerForConversation(this.conversationId);
                }
            }
        }
    }

    private appendCompletedTurn(newMessages: ModelMessage[]): void {
        if (this.disposed) return;
        if (newMessages.length === 0) return;
        if (!this.isStoreEnabled || !this.store) {
            this.messages.push(...newMessages);
            return;
        }

        const finalizedMessages = newMessages.map(finalizeMessageForDisplay);

        this.store.dispatch(
            AGENT.reduxSlice.actions.addMessages({
                id: this.conversationId,
                messages: [...finalizedMessages],
            })
        );
        this.messages.push(...newMessages);
        this.store.dispatch(
            AGENT.reduxSlice.actions.setContextMessages({
                id: this.conversationId,
                messages: [...this.messages],
            })
        );
    }

    private emitSubagentStatus(status: SubagentStatus | null): void {
        for (const listener of this.subagentStatusListeners) {
            listener(status);
        }
    }
}

function toToolCall(part: {
    toolCallId: string;
    toolName: string;
    args?: unknown;
    input?: unknown;
    providerMetadata?: Record<string, any>;
    providerOptions?: Record<string, any>;
}): ToolCall {
    const providerOptions = getToolCallProviderOptions(part);
    return {
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input ?? part.args ?? {},
        ...(providerOptions ? { providerOptions } : {}),
    };
}

function getToolCallProviderOptions(part: {
    providerMetadata?: Record<string, any>;
    providerOptions?: Record<string, any>;
}) {
    if (part.providerOptions?.google?.thoughtSignature) {
        return part.providerOptions;
    }
    const thoughtSignature =
        part.providerMetadata?.google?.thoughtSignature ||
        part.providerMetadata?.openaiCompatible?.thoughtSignature;
    return thoughtSignature
        ? {
              ...part.providerOptions,
              google: {
                  ...part.providerOptions?.google,
                  thoughtSignature,
              },
          }
        : part.providerOptions;
}

function normalizeToolCallId(part: any): string {
    return part?.toolCallId || part?.callId || part?.call_id || part?.id || '';
}

function normalizeToolName(part: any): string {
    return part?.toolName || part?.name || part?.function?.name || part?.tool?.name || '';
}

function extractToolCallDelta(part: any): string {
    const candidates = [
        part?.argsTextDelta,
        part?.argsText,
        part?.inputTextDelta,
        part?.inputText,
        part?.inputDelta,
        part?.arguments,
        part?.input,
        part?.args,
        part?.delta,
    ];
    for (const value of candidates) {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (_) {
                return String(value);
            }
        }
    }
    return '';
}

function notifyObserver<T>(listener: ((payload: T) => void) | undefined, payload: T): void {
    if (!listener) {
        return;
    }
    try {
        listener(payload);
    } catch {
        // Observer failures should never break generation.
    }
}

function getStepNumber(event: unknown, fallback: number): number {
    if (
        event &&
        typeof event === 'object' &&
        'stepNumber' in event &&
        typeof event.stepNumber === 'number'
    ) {
        return event.stepNumber;
    }
    return fallback;
}

function getFinishReason(event: unknown): ProcessMessageFinishReason {
    if (event && typeof event === 'object' && 'finishReason' in event) {
        switch (event.finishReason) {
            case 'stop':
            case 'length':
            case 'content-filter':
            case 'tool-calls':
            case 'error':
            case 'other':
                return event.finishReason;
        }
    }
    return 'other';
}

function getUsage(event: unknown): ProcessMessageUsage {
    if (!(event && typeof event === 'object' && 'usage' in event)) {
        return {};
    }
    const usage = event.usage;
    if (!usage || typeof usage !== 'object') {
        return {};
    }
    const u = usage as Record<string, unknown>;
    return {
        inputTokens: typeof u.inputTokens === 'number' ? u.inputTokens : undefined,
        outputTokens: typeof u.outputTokens === 'number' ? u.outputTokens : undefined,
        totalTokens: typeof u.totalTokens === 'number' ? u.totalTokens : undefined,
    };
}

function toToolResult(output: unknown): ToolResult {
    if (output && typeof output === 'object' && 'type' in output) {
        return output as ToolResult;
    }
    if (typeof output === 'string') {
        return { type: 'text', value: output };
    }
    if (output == null) {
        return { type: 'text', value: '' };
    }
    return { type: 'json', value: output as any };
}

async function buildSystemPrompt(
    systemPrompt: string,
    planContext: string | null,
    conversationId: string
): Promise<string> {
    const base = systemPrompt || '';
    const skillsSection = await resolveSkillsSection();
    const planSection = planContext
        ? `\n\nAPPROVED PLAN:\nThe following plan has been approved by the user. Execute it now.\n${planContext}\n`
        : '';
    const conversationHeader = `### Conversation ID: ${conversationId}\n\n`;
    return `${conversationHeader}${base}${skillsSection}${planSection}`;
}
