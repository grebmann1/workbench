export interface ActivityMessage {
    id?: string;
    role: string;
    content?: unknown;
    parts?: unknown[];
}

export interface MessageEntry {
    key: string;
    message: ActivityMessage;
    isLast: boolean;
}

interface ActivityGroup {
    key: string;
    isGroup: true;
    label: string;
    hasIssues: boolean;
    messages: MessageEntry[];
}

type Outcome = 'pending' | 'complete' | 'failed' | 'denied';

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parts(message: ActivityMessage): unknown[] {
    if (Array.isArray(message.parts)) return message.parts;
    if (Array.isArray(message.content)) return message.content;
    return typeof message.content === 'string' && message.content.trim()
        ? [{ type: 'text', text: message.content }]
        : [];
}

function isTool(part: Record<string, unknown>): boolean {
    return (
        typeof part.type === 'string' &&
        (part.type === 'dynamic-tool' || part.type.startsWith('tool-')) &&
        !part.type.startsWith('tool-approval-')
    );
}

function isActivity(value: unknown): boolean {
    const part = record(value);
    return !!part && (part.type === 'reasoning' || isTool(part));
}

function resultOutcome(output: unknown): Outcome {
    const value = record(output);
    if (!value) return 'complete';
    if (value.type === 'execution-denied') return 'denied';
    if (
        value.isError ||
        (typeof value.exitCode === 'number' && value.exitCode !== 0) ||
        (typeof value.type === 'string' && value.type.startsWith('error'))
    )
        return 'failed';
    return value.value !== undefined ? resultOutcome(value.value) : 'complete';
}

function summarize(entries: MessageEntry[]) {
    const outcomes = new Map<string, Outcome>();
    for (const entry of entries) {
        parts(entry.message).forEach((value, index) => {
            const part = record(value);
            if (!part || !isTool(part)) return;
            const id = String(
                part.toolCallId || part.callId || part.call_id || part.id || `${entry.key}-${index}`
            );
            let outcome: Outcome = 'pending';
            if (part.state === 'output-denied') outcome = 'denied';
            else if (part.state === 'output-error') outcome = 'failed';
            else if (part.type === 'tool-result' || part.state === 'output-available') {
                outcome = resultOutcome(part.output ?? part.result ?? part.content);
            }
            if (outcome !== 'pending' || !outcomes.has(id)) outcomes.set(id, outcome);
        });
    }
    const values = [...outcomes.values()];
    return {
        count: values.length,
        pending: values.includes('pending'),
        failed: values.filter(value => value === 'failed').length,
        denied: values.filter(value => value === 'denied').length,
    };
}

function withParts(entry: MessageEntry, content: unknown[], suffix: string): MessageEntry {
    const message = { ...entry.message, content };
    if (Array.isArray(message.parts)) message.parts = content;
    return { ...entry, key: `${entry.key}-${suffix}`, message };
}

/** Display-only grouping: keep stored history intact and never fold the active request. */
export function groupCompletedActivity(entries: MessageEntry[], isWorking: boolean) {
    const result: (MessageEntry | ActivityGroup)[] = [];
    let turn: MessageEntry[] = [];
    const flush = (active: boolean) => {
        const summary = summarize(turn);
        if (active || !summary.count || summary.pending) {
            result.push(...turn);
            turn = [];
            return;
        }
        const start = turn.findIndex(entry => parts(entry.message).some(isActivity));
        if (start < 0) {
            result.push(...turn);
            turn = [];
            return;
        }
        result.push(...turn.slice(0, start));
        const activity = turn.slice(start);
        const last = activity[activity.length - 1];
        const lastParts = parts(last.message);
        const answerParts = lastParts.filter(part => !isActivity(part));
        let answer: MessageEntry | undefined;
        if (last.message.role === 'assistant' && answerParts.length) {
            answer = withParts(last, answerParts, 'answer');
            activity.pop();
            const lastActivity = lastParts.filter(isActivity);
            if (lastActivity.length) activity.push(withParts(last, lastActivity, 'activity'));
        }
        const issues = [
            ...(summary.failed ? [`${summary.failed} failed`] : []),
            ...(summary.denied ? [`${summary.denied} denied`] : []),
        ];
        const label = `${summary.count} ${summary.count === 1 ? 'action' : 'actions'}`;
        result.push({
            key: `activity-${activity[0].key}`,
            isGroup: true,
            label: issues.length ? `${label} · ${issues.join(' · ')}` : `${label} completed`,
            hasIssues: issues.length > 0,
            messages: activity,
        });
        if (answer) result.push(answer);
        turn = [];
    };
    for (const entry of entries) {
        if (entry.message.role === 'user') {
            flush(false);
            result.push(entry);
        } else {
            turn.push(entry);
        }
    }
    flush(isWorking);
    return result;
}
