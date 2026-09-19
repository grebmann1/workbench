export const ASSISTANT_SUBSCRIPTIONS = [
    {
        id: 'codex',
        llmProvider: 'openai',
        name: 'ChatGPT',
        mark: 'C',
        description: 'Connect your ChatGPT subscription.',
        connectedDescription: 'Using your ChatGPT subscription.',
        signInLabel: 'Sign in with ChatGPT',
    },
    {
        id: 'xai',
        llmProvider: 'grok',
        name: 'Grok',
        mark: '𝕏',
        description: 'Connect your SuperGrok subscription.',
        connectedDescription: 'Using your SuperGrok subscription.',
        signInLabel: 'Sign in with Grok',
    },
] as const;

export const ASSISTANT_API_PROVIDERS = [
    { id: 'openai', name: 'OpenAI', key: 'openai_key', url: 'openai_url' },
    { id: 'anthropic', name: 'Anthropic', key: 'anthropic_key', url: 'anthropic_url' },
    { id: 'gemini', name: 'Google Gemini', key: 'gemini_key', url: 'gemini_url' },
    { id: 'mistral', name: 'Mistral', key: 'mistral_key', url: 'mistral_url' },
    { id: 'grok', name: 'xAI Grok', key: 'grok_key', url: 'grok_url' },
] as const;
