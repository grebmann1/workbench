import type { ModelMessage, ToolResultPart } from 'ai';

export function mergeToolResults(messages: ModelMessage[]): ModelMessage[] {
    const merged: ModelMessage[] = [];
    for (const message of messages) {
        if (!message || message.role === 'system') continue;
        if (message.role !== 'tool') {
            merged.push(message);
            continue;
        }
        const unmatched: ToolResultPart[] = [];
        for (const result of message.content) {
            if (result.type !== 'tool-result') continue;
            let found = false;
            for (let i = merged.length - 1; i >= 0; i--) {
                const candidate = merged[i];
                if (candidate.role !== 'assistant' || !Array.isArray(candidate.content)) continue;
                if (
                    !candidate.content.some(
                        part => part.type === 'tool-call' && part.toolCallId === result.toolCallId
                    )
                )
                    continue;
                // A display-only assistant message may include its associated tool results.
                const parts = [...candidate.content] as Array<
                    (typeof candidate.content)[number] | ToolResultPart
                >;
                const old = parts.findIndex(
                    part => part.type === 'tool-result' && part.toolCallId === result.toolCallId
                );
                if (old >= 0) parts[old] = result;
                else parts.push(result);
                merged[i] = { ...candidate, content: parts } as ModelMessage;
                found = true;
                break;
            }
            if (!found) unmatched.push(result);
        }
        if (unmatched.length) merged.push({ role: 'tool', content: unmatched });
    }
    return merged;
}
