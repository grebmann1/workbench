/**
 * Tests for the N13 step-name extractor.
 *
 * Contract verified here:
 *   - Each known StepType pulls the right field out of `parsedInput`.
 *   - Unknown StepType falls back to the type label / raw type.
 *   - Malformed JSON falls back gracefully (no throw).
 *   - Memoization: re-calling with the same step reference does NOT reparse
 *     (verified by mutating the captured StepInput AFTER the first call).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractStepName } from '../extractStepName.ts';
import type { GenAiInteractionStep } from '../../slices/debugger.ts';

function mk(partial: Partial<GenAiInteractionStep>): GenAiInteractionStep {
    return {
        Id: '0XfAA000000001',
        GenAiInteractionId: '0XaAA000000001',
        StepType: 'LLMCall',
        StepInput: '',
        StepOutput: '',
        Duration: 0,
        TokenCount: null,
        Status: 'Success',
        StepOrder: 1,
        ...partial,
    };
}

test('LLMCall step → returns parsedInput.model', () => {
    const step = mk({
        StepType: 'LLMCall',
        StepInput: JSON.stringify({ model: 'gpt-4o', otherField: 'ignored' }),
    });
    assert.equal(extractStepName(step), 'gpt-4o');
});

test('LLMCall step without model falls back to parsedInput.name', () => {
    const step = mk({
        StepType: 'LLMCall',
        StepInput: JSON.stringify({ name: 'einstein-prompt' }),
    });
    assert.equal(extractStepName(step), 'einstein-prompt');
});

test('ActionExecution step → returns parsedInput.action', () => {
    const step = mk({
        StepType: 'ActionExecution',
        StepInput: JSON.stringify({ action: 'createCase' }),
    });
    assert.equal(extractStepName(step), 'createCase');
});

test('ActionExecution step without action falls back to functionName', () => {
    const step = mk({
        StepType: 'ActionExecution',
        StepInput: JSON.stringify({ functionName: 'doThing' }),
    });
    assert.equal(extractStepName(step), 'doThing');
});

test('TopicClassification step → returns parsedInput.topic', () => {
    const step = mk({
        StepType: 'TopicClassification',
        StepInput: JSON.stringify({ topic: 'Account Management' }),
    });
    assert.equal(extractStepName(step), 'Account Management');
});

test('PlannerInvocation step → returns parsedInput.plannerName', () => {
    const step = mk({
        StepType: 'PlannerInvocation',
        StepInput: JSON.stringify({ plannerName: 'MainPlanner' }),
    });
    assert.equal(extractStepName(step), 'MainPlanner');
});

test('Unknown StepType falls back to the type string', () => {
    const step = mk({
        StepType: 'GuardrailCheck',
        StepInput: JSON.stringify({ irrelevant: 'value' }),
    });
    // GuardrailCheck has a label in STEP_TYPE_LABELS, so we expect that.
    assert.equal(extractStepName(step), 'Guardrail Check');
});

test('Genuinely unknown type falls back to raw type string', () => {
    const step = mk({
        StepType: 'BrandNewType',
        StepInput: JSON.stringify({ noField: true }),
    });
    assert.equal(extractStepName(step), 'BrandNewType');
});

test('Malformed StepInput JSON does NOT throw and falls back', () => {
    const step = mk({
        StepType: 'LLMCall',
        StepInput: '{not really json',
    });
    assert.doesNotThrow(() => extractStepName(step));
    assert.equal(extractStepName(step), 'LLM Call');
});

test('Empty StepInput falls back to type label', () => {
    const step = mk({ StepType: 'LLMCall', StepInput: '' });
    assert.equal(extractStepName(step), 'LLM Call');
});

test('Memoization: same step reference returns cached value (does not reparse)', () => {
    const step = mk({
        StepType: 'LLMCall',
        StepInput: JSON.stringify({ model: 'gpt-4o' }),
    });
    const first = extractStepName(step);
    // Mutate StepInput AFTER first call. If the WeakMap memo is honored,
    // the second call returns the cached value (still 'gpt-4o') even
    // though the underlying string has been rewritten.
    (step as { StepInput: string }).StepInput = JSON.stringify({
        model: 'mutated',
    });
    const second = extractStepName(step);
    assert.equal(first, 'gpt-4o');
    assert.equal(second, 'gpt-4o', 'memoized result must persist across mutations');
});
