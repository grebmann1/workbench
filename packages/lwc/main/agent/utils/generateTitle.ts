import { generateText } from 'ai';
import LOGGER from 'shared/logger';

import { getSummaryModelForAgentProvider } from './models';
import { createProviderInstance, resolveProviderModelInstance } from './providerRuntime';

const TITLE_PROMPT =
    'Generate a short, descriptive title (3-6 words) for a conversation that starts with this message. Return only the title, no quotes or punctuation:\n\n';

export async function generateConversationTitle(
    settings: {
        provider: string;
        apiKey: string;
        baseUrl?: string;
        isInternal?: boolean;
        selectedModel?: string;
    },
    firstMessage: string
): Promise<string> {
    const { provider, apiKey, baseUrl, isInternal = false, selectedModel } = settings;
    const modelId = getSummaryModelForAgentProvider(provider, selectedModel, isInternal);
    const providerInstance = createProviderInstance({ provider, apiKey, baseUrl, isInternal });

    LOGGER.debug('[generateTitle] Generating title with model:', modelId);

    const { text } = await generateText({
        model: resolveProviderModelInstance(providerInstance, { provider, modelId, isInternal }),
        prompt: `${TITLE_PROMPT}${firstMessage}`,
        maxRetries: 0,
        temperature: 0.5,
        maxOutputTokens: 20,
    });

    const title = text.trim();
    LOGGER.debug('[generateTitle] Generated title:', title);
    return title;
}
