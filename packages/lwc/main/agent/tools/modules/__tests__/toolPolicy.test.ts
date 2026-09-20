import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getToolPolicy, approveToolCall } from '../toolPolicy';
import { resolveQuestion } from '../askUserBridge';

test('unknown MCP tools and arbitrary code require approval; local reads do not', () => {
    for (const name of ['bash', 'mcp__server__read_sounding_name', 'future_tool']) {
        assert.equal(getToolPolicy(name).requiresApproval, true);
    }
    assert.equal(getToolPolicy('readFile').requiresApproval, false);
    assert.equal(getToolPolicy('ask_user').requiresApproval, false);
    assert.equal(getToolPolicy('browser_tabs').requiresApproval, false);
    assert.equal(getToolPolicy('browser_snapshot').requiresApproval, false);
    for (const name of [
        'browser_click',
        'browser_fill',
        'browser_select',
        'browser_navigate',
        'browser_scroll',
    ]) {
        assert.equal(getToolPolicy(name).requiresApproval, true);
    }
});

test('tool approval is bound to the exact displayed call and denial never executes it', async () => {
    const previousWindow = globalThis.window;
    let answer = 'Deny';
    let displayed;
    Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: {
            dispatchEvent(event) {
                if (event.type === 'agent:ask_user') {
                    displayed = event.detail;
                    resolveQuestion(displayed.id, answer);
                }
            },
        },
    });
    try {
        await assert.rejects(
            approveToolCall('bash', { command: 'sf apex run' }, 'conversation-a'),
            /not approved/
        );
        assert.equal(displayed.conversationId, 'conversation-a');
        assert.match(displayed.question, /sf apex run/);
        answer = 'Allow once';
        await approveToolCall('bash', { command: 'sf apex run' }, 'conversation-a');
        await assert.rejects(approveToolCall('bash', {}, 'conversation-a', AbortSignal.abort()));
    } finally {
        if (previousWindow)
            Object.defineProperty(globalThis, 'window', {
                configurable: true,
                value: previousWindow,
            });
        else delete globalThis.window;
    }
});

test('YOLO skips tool approval for browser, Bash, and MCP calls but still obeys cancellation', async () => {
    // No window is installed: any accidental approval prompt would fail this test.
    for (const name of [
        'browser_click',
        'browser_fill',
        'bash',
        'mcp__server__write',
        'future_tool',
    ]) {
        await approveToolCall(name, {}, 'yolo-chat', undefined, '', 'yolo');
        await assert.rejects(
            approveToolCall(name, {}, 'yolo-chat', AbortSignal.abort(), '', 'yolo')
        );
    }
});

test('tool input cannot grant itself YOLO permission', async () => {
    await assert.rejects(
        approveToolCall('bash', { approvalMode: 'yolo' }, 'normal-chat'),
        /requires an open chat/
    );
});
