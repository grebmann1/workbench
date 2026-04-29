import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStreamMessageBuilder } from '../streamBuilder.ts';

type Msg = { role: string; content: any[] } | null;

test('createStreamMessageBuilder: concatenates consecutive text chunks into one text part', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({ type: 'content', content: 'Hello ' } as any);
    handleChunk({ type: 'content', content: 'world' } as any);

    const last = messages[messages.length - 1];
    assert.ok(last);
    assert.equal(last.content.length, 1);
    assert.equal(last.content[0].type, 'text');
    assert.equal(last.content[0].text, 'Hello world');
});

test('createStreamMessageBuilder: appends to streaming reasoning, finalises on done', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({ type: 'reasoning', content: 'thinking...' } as any);
    handleChunk({ type: 'reasoning', content: ' more' } as any);
    handleChunk({ type: 'done' } as any);

    // Walk back to find the last non-null reasoning state
    const finalReasoning = messages
        .filter(Boolean)
        .map(m => m!.content.find((p: any) => p.type === 'reasoning'))
        .filter(Boolean)
        .pop();
    assert.equal(finalReasoning.text, 'thinking... more');
    assert.equal(finalReasoning.state, 'done');
    // Last emission is null — indicates stream closure.
    assert.equal(messages[messages.length - 1], null);
});

test('createStreamMessageBuilder: text after reasoning finalises the reasoning part', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({ type: 'reasoning', content: 'hmm' } as any);
    handleChunk({ type: 'content', content: 'answer' } as any);

    const last = messages[messages.length - 1];
    const reasoningPart = last!.content.find((p: any) => p.type === 'reasoning');
    const textPart = last!.content.find((p: any) => p.type === 'text');
    assert.equal(reasoningPart.state, 'done');
    assert.equal(textPart.text, 'answer');
});

test('createStreamMessageBuilder: tool_call_delta builds up streaming input', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({
        type: 'tool_call_delta',
        toolCallId: 't1',
        toolName: 'search',
        delta: '{"q":',
    } as any);
    handleChunk({
        type: 'tool_call_delta',
        toolCallId: 't1',
        delta: '"hi"}',
    } as any);

    const last = messages[messages.length - 1];
    const toolCall = last!.content.find((p: any) => p.type === 'tool-call');
    assert.equal(toolCall.toolCallId, 't1');
    assert.equal(toolCall.toolName, 'search');
    assert.equal(toolCall.input, '{"q":"hi"}');
    assert.equal(toolCall.state, 'input-streaming');
});

test('createStreamMessageBuilder: tool_calls upserts final input-available state', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({
        type: 'tool_calls',
        toolCalls: [{ toolCallId: 't2', toolName: 'run', input: { cmd: 'ls' } }],
    } as any);

    const last = messages[messages.length - 1];
    const toolCall = last!.content.find((p: any) => p.type === 'tool-call');
    assert.equal(toolCall.state, 'input-available');
    assert.deepEqual(toolCall.input, { cmd: 'ls' });
});

test('createStreamMessageBuilder: tool_calls preserves provider options metadata', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({
        type: 'tool_calls',
        toolCalls: [
            {
                toolCallId: 't2',
                toolName: 'run',
                input: { cmd: 'ls' },
                providerOptions: {
                    google: {
                        thoughtSignature: '<Signature A>',
                    },
                },
            },
        ],
    } as any);

    const last = messages[messages.length - 1];
    const toolCall = last!.content.find((p: any) => p.type === 'tool-call');
    assert.equal(toolCall.providerOptions.google.thoughtSignature, '<Signature A>');
});

test('createStreamMessageBuilder: tool_result appends a tool-result part', () => {
    const messages: Msg[] = [];
    const { handleChunk } = createStreamMessageBuilder(m => messages.push(m as any));

    handleChunk({
        type: 'tool_result',
        toolCall: { toolCallId: 't3', toolName: 'run' },
        toolResult: { output: 'hi' },
    } as any);

    const last = messages[messages.length - 1];
    const toolResult = last!.content.find((p: any) => p.type === 'tool-result');
    assert.equal(toolResult.toolCallId, 't3');
    assert.equal(toolResult.output, 'hi');
});

test('createStreamMessageBuilder: startReasoning / finalizeReasoning transition state', () => {
    const messages: Msg[] = [];
    const { startReasoning, finalizeReasoning, handleChunk } = createStreamMessageBuilder(m =>
        messages.push(m as any)
    );

    startReasoning();
    handleChunk({ type: 'reasoning', content: 'thought' } as any);
    finalizeReasoning();

    const last = messages[messages.length - 1];
    const reasoning = last!.content.find((p: any) => p.type === 'reasoning');
    assert.equal(reasoning.state, 'done');
    assert.equal(reasoning.text, 'thought');
});
