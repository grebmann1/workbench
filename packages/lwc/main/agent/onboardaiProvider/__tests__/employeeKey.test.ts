import assert from 'node:assert/strict';
import { test } from 'node:test';

import { EMPLOYEE_LLM_KEY_PATTERN, isEmployeeLlmKeyValid } from '../employeeKey.ts';

test('isEmployeeLlmKeyValid: accepts generated keys with underscores', () => {
    assert.equal(isEmployeeLlmKeyValid('sk-F68c_GLtGiOY4i4LnmUwEg'), true);
});

test('isEmployeeLlmKeyValid: rejects values without sk prefix', () => {
    assert.equal(isEmployeeLlmKeyValid('F68c_GLtGiOY4i4LnmUwEg'), false);
});

test('EMPLOYEE_LLM_KEY_PATTERN: compiles with browser pattern v flag', () => {
    assert.doesNotThrow(() => new RegExp(`^(?:${EMPLOYEE_LLM_KEY_PATTERN})$`, 'v'));
});
