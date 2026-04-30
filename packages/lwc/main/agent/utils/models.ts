import {
    getProviderModelOptions,
    OPENAI_MODEL_OPTIONS,
    INTERNAL_MODEL_OPTIONS,
    getDefaultModelForProvider,
    normalizeLlmProvider,
    type LlmProvider,
} from 'shared/llm';

export const MODELS = OPENAI_MODEL_OPTIONS.map(model => ({
    label: model.label,
    value: model.value,
}));

export const INTERNAL_MODELS = INTERNAL_MODEL_OPTIONS.map(model => ({
    label: model.label,
    value: model.value,
    provider: model.provider,
}));

export const DEFAULT_MODEL = getDefaultModelForProvider('openai') || MODELS[0].value;

const SUMMARY_MODEL_PREFERENCES: Record<LlmProvider, string[]> = {
    openai: ['gpt-5.4-mini', 'gpt-5-mini', 'gpt-5.4-nano', 'gpt-5-nano-2025-08-07'],
    anthropic: [
        'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        'claude-haiku-4-5-20251001',
        'us.anthropic.claude-sonnet-4-6',
        'claude-sonnet-4-6',
    ],
    gemini: ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview'],
    mistral: ['mistral-small-2603', 'mistral-medium-2508'],
    grok: ['grok-4-1-fast-reasoning'],
    workbench: ['gpt-4o-mini'],
};

function isLightweightSummaryModel(modelId: string) {
    return /mini|nano|lite|flash|haiku|small|fast/i.test(modelId);
}

function getInternalModelsForProvider(provider: unknown) {
    const normalizedProvider = normalizeLlmProvider(provider);
    const providerModels = INTERNAL_MODEL_OPTIONS.filter(
        model => model.provider === normalizedProvider
    );

    return providerModels.map(model => ({
        label: model.label,
        value: model.value,
    }));
}

function getModelsForProvider(provider: unknown, isInternal = false) {
    if (isInternal) {
        return getInternalModelsForProvider(provider);
    }

    return getProviderModelOptions(normalizeLlmProvider(provider)).map(model => ({
        label: model.label,
        value: model.value,
    }));
}

export function getDefaultModelForAgentProvider(
    provider: LlmProvider | string,
    isInternal = false
) {
    const models = getModelsForProvider(provider, isInternal);
    return models[0]?.value || DEFAULT_MODEL;
}

export function getSummaryModelForAgentProvider(
    provider: LlmProvider | string,
    selectedModel?: string,
    isInternal = false
) {
    const normalizedProvider = normalizeLlmProvider(provider);
    const models = getModelsForProvider(normalizedProvider, isInternal);
    const availableModelIds = new Set(models.map(model => model.value));
    const normalizedSelectedModel = typeof selectedModel === 'string' ? selectedModel.trim() : '';

    if (
        normalizedSelectedModel &&
        availableModelIds.has(normalizedSelectedModel) &&
        isLightweightSummaryModel(normalizedSelectedModel)
    ) {
        return normalizedSelectedModel;
    }

    if (normalizedSelectedModel && !availableModelIds.has(normalizedSelectedModel) && !isInternal) {
        return normalizedSelectedModel;
    }

    const preferredSummaryModel = SUMMARY_MODEL_PREFERENCES[normalizedProvider].find(modelId =>
        availableModelIds.has(modelId)
    );
    if (preferredSummaryModel) {
        return preferredSummaryModel;
    }

    if (normalizedSelectedModel && availableModelIds.has(normalizedSelectedModel)) {
        return normalizedSelectedModel;
    }

    return models[0]?.value || DEFAULT_MODEL;
}

export const REASONING_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'X-High' },
];
export const DEFAULT_REASONING = REASONING_OPTIONS[2].value;
