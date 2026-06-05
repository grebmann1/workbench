import { streamText } from 'ai';
import type { OAuthCredentials } from 'shared/llm';
import LOGGER from 'shared/logger';

import { getSummaryModelForAgentProvider } from './models';
import { createProviderInstance, resolveProviderModelInstance } from './providerRuntime';

const TITLE_PROMPT =
    'Generate a short, descriptive title (3-6 words) for a conversation that starts with this message. Return only the title, no quotes or punctuation:\n\n';

function shouldOmitTemperature(modelId: string) {
    return /^gpt-5/i.test(modelId);
}

export async function generateConversationTitle(
    settings: {
        provider: string;
        apiKey: string;
        baseUrl?: string;
        isInternal?: boolean;
        selectedModel?: string;
        authMode?: 'apiKey' | 'oauth';
        oauth?: OAuthCredentials | null;
    },
    firstMessage: string
): Promise<string> {
    const { provider, apiKey, baseUrl, isInternal = false, selectedModel, authMode, oauth } =
        settings;
    const modelId = getSummaryModelForAgentProvider(provider, selectedModel, isInternal);
    const providerInstance = createProviderInstance({
        provider,
        apiKey,
        baseUrl,
        isInternal,
        authMode,
        oauth,
    });

    LOGGER.debug('[generateTitle] Generating title with model:', modelId);

    const request = {
        model: resolveProviderModelInstance(providerInstance, {
            provider,
            modelId,
            isInternal,
            authMode,
        }),
        prompt: `${TITLE_PROMPT}${firstMessage}`,
        maxRetries: 0,
        maxOutputTokens: 20,
    } as {
        model: ReturnType<typeof resolveProviderModelInstance>;
        prompt: string;
        maxRetries: number;
        maxOutputTokens: number;
        temperature?: number;
    };

    if (!shouldOmitTemperature(modelId)) {
        request.temperature = 0.5;
    }

    // streamText (not generateText): WHAM only supports streaming ("Stream must be set to
    // true"). For non-streaming providers this still resolves the full text.
    const result = streamText(request);
    const title = (await result.text).trim();
    LOGGER.debug('[generateTitle] Generated title:', title);
    return title;
}
