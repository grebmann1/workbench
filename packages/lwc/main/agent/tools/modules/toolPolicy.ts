import { createQuestion } from './askUserBridge';

export type ToolApprovalMode = 'ask' | 'yolo';

export type ToolPolicy = {
    access: 'read' | 'write' | 'unknown';
    credentialScope: 'none' | 'salesforce' | 'server';
    requiresApproval: boolean;
};

const READ_TOOLS = new Set([
    'readFile',
    'loadSkill',
    'discoverSkills',
    'fetchSkill',
    'ask_user',
    'get_current_connection',
    'check_user_logged_in',
    'get_current_application',
    'list_connections',
    'browser_tabs',
    'browser_snapshot',
]);

export function getToolPolicy(name: string): ToolPolicy {
    if (READ_TOOLS.has(name))
        return { access: 'read', credentialScope: 'none', requiresApproval: false };
    if (name === 'writeFile' || name === 'saveSkill') {
        return { access: 'write', credentialScope: 'none', requiresApproval: false };
    }
    // Arbitrary shell/JS and server tools cannot safely be classified from their names or text.
    return {
        access: 'unknown',
        credentialScope: name.startsWith('mcp__') ? 'server' : 'salesforce',
        requiresApproval: true,
    };
}

export async function approveToolCall(
    name: string,
    input: unknown,
    conversationId: string,
    signal?: AbortSignal,
    context = '',
    approvalMode: ToolApprovalMode = 'ask'
): Promise<void> {
    signal?.throwIfAborted();
    if (approvalMode === 'yolo') return;
    if (!getToolPolicy(name).requiresApproval) return;
    if (typeof window === 'undefined') throw new Error('Tool approval requires an open chat.');
    const id = `approval-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const details = JSON.stringify(input, null, 2);
    const answer = createQuestion(id, signal);
    window.dispatchEvent(
        new CustomEvent('agent:ask_user', {
            detail: {
                id,
                conversationId,
                question: `Allow ${name}${context ? ` (${context})` : ''}?\n${details}`,
                options: ['Allow once', 'Deny'],
            },
        })
    );
    try {
        if ((await answer) !== 'Allow once') throw new Error('Tool execution was not approved.');
        signal?.throwIfAborted();
    } finally {
        window.dispatchEvent(new CustomEvent('agent:question_closed', { detail: { id } }));
    }
}
