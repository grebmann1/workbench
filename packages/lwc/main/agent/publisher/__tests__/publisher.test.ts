import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';

function createPublisher() {
    const events: CustomEvent[] = [];
    const textarea = { value: '', style: {}, scrollHeight: 24, focus() {} };
    class Element {
        template = { querySelector: () => textarea };
        dispatchEvent(event: CustomEvent) {
            events.push(event);
        }
    }
    const { default: Publisher } = loadTypeScriptModule(
        new URL('../publisher.ts', import.meta.url),
        {
            'agent/utils': {
                MODELS: [],
                INTERNAL_MODELS: [],
                REASONING_OPTIONS: [],
                DEFAULT_MODEL: 'model',
                DEFAULT_REASONING: 'low',
            },
            'core/toolkitElement': { default: Element, __esModule: true },
            lwc: { api() {}, track() {} },
            'shared/llm': { normalizeModelSelection: value => value },
            'shared/logger': {},
            'shared/utils': { isEmpty: value => !value?.trim(), runActionAfterTimeOut() {} },
            'application/applicationRegistry': { APPLICATION_SLASH_COMMANDS: [] },
            'host-api/slashCommands': { getSlashCommands: () => [] },
        },
        { CustomEvent, getComputedStyle: () => ({ maxHeight: '160px' }) }
    );
    return { publisher: new Publisher(), events, textarea };
}

test('sending while busy retains attachments and model in the parent-owned request', async () => {
    const { publisher, events, textarea } = createPublisher();
    const attachment = new File(['queued data'], 'data.csv', { type: 'text/csv' });
    publisher.isLoading = true;
    publisher.selectedFiles = [attachment];
    publisher.selectedModel = 'selected-model';
    publisher.selectedReasoning = 'high';
    textarea.value = '  Queue this  ';
    await publisher.handleSendClick();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'send');
    assert.equal(events[0].detail.prompt, 'Queue this');
    assert.equal(events[0].detail.files[0], attachment);
    assert.equal(events[0].detail.model, 'selected-model');
    assert.equal(events[0].detail.reasoning, 'high');
    assert.equal(publisher.selectedFiles.length, 0);
    publisher.isLoading = false;
    assert.equal(events.length, 1, 'loading transitions must never dequeue work');
});

test('priority send preserves attachments and delegates ordering to the controller', () => {
    const { publisher, events, textarea } = createPublisher();
    const attachment = new File(['a'], 'a.txt', { type: 'text/plain' });
    publisher.selectedFiles = [attachment];
    textarea.value = 'Next';
    publisher.handlePushClick();
    assert.equal(events[0].detail.priority, true);
    assert.equal(events[0].detail.files[0], attachment);
    assert.equal(publisher.selectedFiles.length, 0);
});
