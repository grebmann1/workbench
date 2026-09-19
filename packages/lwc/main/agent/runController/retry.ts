import type { ModelMessage } from 'ai';

export function prepareRetry(messages: ModelMessage[], index = messages.length - 1) {
    let userIndex = Math.min(index, messages.length - 1);
    while (userIndex >= 0 && messages[userIndex].role !== 'user') userIndex--;
    if (userIndex < 0) return null;
    return { history: messages.slice(0, userIndex), messages: [messages[userIndex]] };
}
