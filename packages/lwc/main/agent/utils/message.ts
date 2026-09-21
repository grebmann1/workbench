import type { ModelMessage, ToolModelMessage, ToolResultPart } from 'ai';
import { isNotUndefinedOrNull, isRecord } from 'shared/utils';

import { parseDataUrl } from './runnerHelpers';

export function buildUserMessageParts({ text, filesData }) {
    const parts = [];
    if (typeof text === 'string' && text.trim()) {
        parts.push({ type: 'text', text });
    }
    const files = Array.isArray(filesData) ? filesData : [];
    files.forEach(file => {
        if (!file || typeof file !== 'object') return;
        const rawContent = typeof file.content === 'string' ? file.content : '';
        const rawMediaType = typeof file.type === 'string' ? file.type : '';
        if (!rawContent || !rawMediaType) return;

        // Extract bare base64 from data URL (e.g. "data:image/png;base64,<data>")
        const parsed = parseDataUrl(rawContent);
        const data = parsed ? parsed.base64 : rawContent;
        const mediaType = parsed ? parsed.mediaType : rawMediaType;

        if (mediaType.startsWith('image/')) {
            // AI SDK ImagePart: { type: 'image', image: DataContent, mediaType? }
            parts.push({ type: 'image', image: data, mediaType });
        } else {
            // AI SDK FilePart: { type: 'file', data: DataContent, mediaType, filename? }
            parts.push({
                type: 'file',
                data,
                mediaType,
                filename: typeof file.name === 'string' ? file.name : undefined,
            });
        }
    });
    return parts;
}

export function createUserModelMessage({ text, filesData }): ModelMessage {
    return {
        role: 'user',
        content: buildUserMessageParts({ text, filesData }),
    };
}

export function isUiMessage(message: unknown): boolean {
    if (message == null || typeof message !== 'object') return false;
    const candidate = message as { id?: unknown; role?: unknown; parts?: unknown };
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.role === 'string' &&
        Array.isArray(candidate.parts)
    );
}

function getToolCallId(part: Record<string, unknown>): string | undefined {
    const id = part.toolCallId ?? part.callId ?? part.call_id ?? part.tool_call_id ?? part.id;
    return typeof id === 'string' ? id : undefined;
}

function normalizeToolOutput(output: unknown, isError = false): unknown {
    if (isRecord(output)) {
        if (output.type === 'content' && isRecord(output.value) && !Array.isArray(output.value)) {
            // chrome.storage serializes Proxy arrays as objects with numeric keys.
            // Restore only contiguous indexes; other objects remain validation errors.
            const value = output.value;
            const keys = Object.keys(value);
            if (keys.every((key, index) => key === String(index))) {
                return { ...output, value: keys.map(key => value[key]) };
            }
        }
        // SDK model outputs already have an envelope. Do not double-wrap it or
        // discard provider options, multimodal content, or execution denials.
        if (
            output.type === 'execution-denied' ||
            ('value' in output &&
                (output.type === 'text' ||
                    output.type === 'json' ||
                    output.type === 'error-text' ||
                    output.type === 'error-json' ||
                    output.type === 'content'))
        ) {
            return output;
        }
        // OpenAI Agents function_call_result used a text/text envelope.
        if (output.type === 'text' && typeof output.text === 'string') {
            return { ...output, type: isError ? 'error-text' : 'text', value: output.text };
        }
    }
    return typeof output === 'string'
        ? { type: isError ? 'error-text' : 'text', value: output }
        : { type: isError ? 'error-json' : 'json', value: output };
}

function normalizeHistoryPart(part: unknown, toolNames: Map<string, string>): unknown {
    if (!isRecord(part)) return part;
    switch (part.type) {
        case 'input_text':
        case 'output_text':
            return { ...part, type: 'text' };
        case 'summary_text':
            return { ...part, type: 'reasoning' };
        case 'reasoning':
            return part.text === undefined && typeof part.reasoning === 'string'
                ? { ...part, text: part.reasoning }
                : part;
        case 'input_image': {
            const image = part.image ?? part.image_url;
            return image === undefined ? part : { ...part, type: 'image', image };
        }
        case 'input_file': {
            const data = part.file_data ?? part.file_id;
            return typeof data === 'string'
                ? {
                      ...part,
                      type: 'file',
                      data,
                      // The old attachment writer only supported PDF files.
                      mediaType: part.mediaType ?? 'application/pdf',
                  }
                : part;
        }
        case 'function_call':
        case 'tool-call': {
            const toolCallId = getToolCallId(part);
            const toolName = part.toolName ?? part.name;
            let input = part.input;
            if (input === undefined) {
                input = part.args ?? part.arguments;
                if (typeof input === 'string') {
                    try {
                        input = JSON.parse(input);
                    } catch {
                        // Keep incomplete/unknown arguments, rather than inventing {}.
                    }
                }
            }
            if (toolCallId && typeof toolName === 'string') {
                toolNames.set(toolCallId, toolName);
            }
            return part.type === 'tool-call' &&
                part.toolCallId === toolCallId &&
                part.toolName === toolName &&
                part.input === input
                ? part
                : { ...part, type: 'tool-call', toolCallId, toolName, input };
        }
        case 'function_call_result':
        case 'function_call_output':
        case 'tool-result': {
            const toolCallId = getToolCallId(part);
            const toolName =
                part.toolName ?? part.name ?? (toolCallId ? toolNames.get(toolCallId) : undefined);
            const rawOutput =
                part.output !== undefined
                    ? part.output
                    : part.result !== undefined
                      ? part.result
                      : part.content;
            const output = normalizeToolOutput(rawOutput, part.isError === true);
            return part.type === 'tool-result' &&
                part.toolCallId === toolCallId &&
                part.toolName === toolName &&
                part.output === output
                ? part
                : { ...part, type: 'tool-result', toolCallId, toolName, output };
        }
        default:
            return part;
    }
}

/**
 * Migrate the persisted OpenAI Agents/Responses history and older SDK parts at
 * the model boundary. Display-only fields and provider metadata stay intact.
 * Unknown shapes are left for SDK validation, never silently dropped or made
 * into an empty message. Modern messages retain their object identity.
 */
export function normalizeModelMessages(messages: readonly unknown[]): ModelMessage[] {
    const toolNames = new Map<string, string>();
    return messages.map(message => {
        if (!isRecord(message)) return message;
        if (
            !Array.isArray(message.content) &&
            (message.type === 'function_call' ||
                message.type === 'function_call_result' ||
                message.type === 'function_call_output')
        ) {
            return {
                ...message,
                role: message.type === 'function_call' ? 'assistant' : 'tool',
                content: [normalizeHistoryPart(message, toolNames)],
            };
        }
        const content =
            message.content ??
            (Array.isArray(message.parts) ? message.parts : undefined) ??
            (message.type === 'reasoning' && Array.isArray(message.summary)
                ? message.summary
                : undefined);
        if (message.role === 'tool' && !Array.isArray(content)) {
            return {
                ...message,
                content: [
                    normalizeHistoryPart({ ...message, type: 'tool-result', content }, toolNames),
                ],
            };
        }
        if (!Array.isArray(content)) return message;
        let normalized: unknown[] | undefined;
        for (let index = 0; index < content.length; index++) {
            const part = normalizeHistoryPart(content[index], toolNames);
            if (part !== content[index]) {
                normalized ??= content.slice();
                normalized[index] = part;
            }
        }
        if (!normalized && message.content === content) {
            return message;
        }
        return {
            ...message,
            ...(message.type === 'reasoning' && message.role === undefined
                ? { role: 'assistant' }
                : {}),
            content: normalized ?? content,
        };
    }) as ModelMessage[];
}

/**
 * Discard unfinished trailing tool exchanges after cancellation.
 * Completed exchanges do not require a subsequent text answer.
 */
export function sanitizeIncompleteToolExchanges(messages: ModelMessage[]): ModelMessage[] {
    let end = messages.length;
    while (end > 0) {
        let assistantIndex = end - 1;
        while (assistantIndex >= 0 && messages[assistantIndex].role === 'tool') {
            assistantIndex--;
        }
        const assistant = messages[assistantIndex];
        if (!assistant || assistant.role !== 'assistant' || !Array.isArray(assistant.content)) {
            break;
        }
        const pending = new Set<string>();
        for (const part of assistant.content) {
            if (part?.type === 'tool-call' && !part.providerExecuted) {
                pending.add(part.toolCallId);
            }
        }
        for (let index = assistantIndex; index < end; index++) {
            const content = messages[index].content;
            if (!Array.isArray(content)) continue;
            for (const part of content) {
                if (part?.type === 'tool-result') pending.delete(part.toolCallId);
            }
        }
        if (pending.size === 0) break;
        end = assistantIndex;
    }
    return end === messages.length ? messages : messages.slice(0, end);
}

// Helper method to process toolResult and transform it to message(s)
export function processToolResultToMessage(toolResult: any, toolCall: any): ToolModelMessage {
    const toolResultPart = {
        type: 'tool-result',
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output: {
            type: 'content',
            value: [
                {
                    type: 'text',
                    text: toolResult.text || toolResult.output || toolResult.content || '',
                },
                ...(toolResult.images &&
                Array.isArray(toolResult.images) &&
                toolResult.images.length > 0
                    ? toolResult.images.map(image => ({
                          type: 'image-data',
                          data: image.dataUrl,
                          mediaType: image.mediaType,
                      }))
                    : []),
            ],
        },
    } as unknown as ToolResultPart;

    return {
        role: 'tool',
        content: [toolResultPart],
    } as ToolModelMessage;
}

export function areMessagesEqual(msg1, msg2) {
    return (
        msg1 &&
        msg2 &&
        ((msg1.id === msg2.id && isNotUndefinedOrNull(msg1.id)) ||
            (msg1._key === msg2._key && isNotUndefinedOrNull(msg1._key)))
    );
}

export function appendMessageIfNotExists(messages, newMsg) {
    console.log('[appendMessageIfNotExists] appendMessageIfNotExists', { messages, newMsg });
    if (!messages.some(m => areMessagesEqual(m, newMsg))) {
        return [...messages, newMsg];
    }
    return messages || [];
}

export const Message = {
    areMessagesEqual,
    appendMessageIfNotExists,
    isUiMessage,
    createUserModelMessage,
    processToolResultToMessage,
};
