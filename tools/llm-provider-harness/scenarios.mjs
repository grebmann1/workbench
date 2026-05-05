import { tool } from 'ai';
import { z } from 'zod';

const getTimeTool = tool({
    description: 'Returns the current UTC time as an ISO-8601 string.',
    inputSchema: z.object({}).strict(),
    execute: async () => ({ nowUtc: new Date().toISOString() }),
});

export const SCENARIOS = [
    {
        name: 'openai-basic',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        prompt:
            'Write a friendly 4-sentence paragraph introducing yourself as a Salesforce admin assistant. ' +
            'Mention SOQL, metadata, and debugging.',
        expectStreaming: true,
    },
    {
        name: 'openai-reasoning',
        provider: 'openai',
        modelId: 'gpt-5-mini',
        prompt:
            'Compute 17 * 23 step by step, then compute 41 * 19 step by step. ' +
            'Answer with both results in a short 3-sentence summary.',
        reasoningEffort: 'medium',
        expectStreaming: true,
        expectReasoning: true,
    },
    {
        name: 'openai-tool-call',
        provider: 'openai',
        modelId: 'gpt-4o-mini',
        prompt: 'Use the get_time tool to look up the current UTC time, then tell me.',
        tools: { get_time: getTimeTool },
        expectStreaming: true,
        expectTools: true,
    },
    {
        name: 'openai-multiturn',
        provider: 'openai',
        modelId: 'gpt-4o',
        prompt: 'Call get_time, then answer: is the UTC hour currently odd or even?',
        tools: { get_time: getTimeTool },
        expectStreaming: true,
        expectTools: true,
    },
    {
        name: 'gemini-basic',
        provider: 'gemini',
        modelId: 'gemini-3-flash-preview',
        prompt:
            'Write a friendly 4-sentence paragraph introducing yourself as a Salesforce admin assistant. ' +
            'Mention SOQL, metadata, and debugging.',
        expectStreaming: true,
    },
    {
        name: 'gemini-thinking',
        provider: 'gemini',
        modelId: 'gemini-3-pro-preview',
        prompt:
            'Compute 17 * 23 step by step, then compute 41 * 19 step by step. ' +
            'Answer with both results in a short 3-sentence summary.',
        reasoningEffort: 'high',
        expectStreaming: true,
        expectReasoning: true,
    },
    {
        name: 'gemini-tool-call',
        provider: 'gemini',
        modelId: 'gemini-3-flash-preview',
        prompt: 'Use the get_time tool to look up the current UTC time, then tell me.',
        tools: { get_time: getTimeTool },
        expectStreaming: true,
        expectTools: true,
    },
    // The 'anthropic' provider routes through AWS Bedrock whenever the internal
    // gateway baseUrl ends with '/bedrock' (see isAnthropicBedrockGateway in
    // provider/anthropic/bedrock.ts). All scenarios below exercise that path.
    {
        name: 'bedrock-haiku-basic',
        provider: 'anthropic',
        modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt:
            'Write a friendly 4-sentence paragraph introducing yourself as a Salesforce admin assistant. ' +
            'Mention SOQL, metadata, and debugging.',
        expectStreaming: true,
    },
    {
        name: 'bedrock-sonnet-thinking',
        provider: 'anthropic',
        modelId: 'us.anthropic.claude-sonnet-4-6',
        prompt:
            'Compute 17 * 23 step by step, then compute 41 * 19 step by step. ' +
            'Answer with both results in a short 3-sentence summary.',
        reasoningEffort: 'medium',
        expectStreaming: true,
        expectReasoning: true,
    },
    {
        name: 'bedrock-haiku-tool-call',
        provider: 'anthropic',
        modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        prompt: 'Use the get_time tool to look up the current UTC time, then tell me.',
        tools: { get_time: getTimeTool },
        expectStreaming: true,
        expectTools: true,
    },
    // NOTE: Opus-4-7 on Bedrock rejects the classic
    // `thinking: { type: 'enabled', budgetTokens }` payload that
    // @ai-sdk/anthropic@3.0.68 emits. The gateway requires the newer
    // `thinking: { type: 'adaptive' }` + `output_config.effort` shape.
    // Until either the SDK supports that shape or we add a Bedrock-side
    // request rewrite, we only exercise Opus without reasoning here.
    // Sonnet-4-6 above still covers the thinking path end-to-end.
    {
        name: 'bedrock-opus-tool-call',
        provider: 'anthropic',
        modelId: 'us.anthropic.claude-opus-4-7',
        prompt: 'Use the get_time tool to look up the current UTC time, then tell me.',
        tools: { get_time: getTimeTool },
        expectStreaming: true,
        expectTools: true,
    },
];
