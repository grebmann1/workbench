import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    SHELL_TOOL_HELP,
    TOOL_OUTPUT_LIMITS,
    SKILL_PATH_TEMPLATES,
    MODEL_FAMILY_TOOL_TYPES,
    AGENT_TOOL_CONFIG,
    TOOL_APP_NAMES,
    CONNECTION_TOOL_DESCRIPTIONS,
    GENERAL_TOOL_DESCRIPTIONS,
    SKILL_NAME_PATTERN,
    SKILL_ROOT_DIR_BY_SCOPE,
} from '../constants.ts';

test('SHELL_TOOL_HELP: every entry is a non-empty string', () => {
    for (const [key, value] of Object.entries(SHELL_TOOL_HELP)) {
        assert.equal(typeof value, 'string', `${key} must be a string`);
        assert.ok(value.length > 0, `${key} must be non-empty`);
    }
    assert.ok(SHELL_TOOL_HELP.js.includes('js -e'), 'js help shows inline usage');
    assert.ok(SHELL_TOOL_HELP.saveSkill.includes('save-skill'), 'saveSkill help mentions command');
});

test('TOOL_OUTPUT_LIMITS: maxChars > tailChars > 0, integer page size', () => {
    assert.ok(TOOL_OUTPUT_LIMITS.maxChars > TOOL_OUTPUT_LIMITS.tailChars);
    assert.ok(TOOL_OUTPUT_LIMITS.tailChars > 0);
    assert.ok(TOOL_OUTPUT_LIMITS.pageSize > 0);
    assert.equal(TOOL_OUTPUT_LIMITS.directory, '/tmp/tool-outputs');
    assert.ok(TOOL_OUTPUT_LIMITS.truncatedMarker.includes('TRUNCATED'));
});

test('SKILL_PATH_TEMPLATES: every template contains {name} + ends with SKILL.md', () => {
    for (const t of SKILL_PATH_TEMPLATES) {
        assert.ok(t.includes('{name}'), `${t} missing {name}`);
        assert.ok(t.endsWith('SKILL.md'), `${t} must end with SKILL.md`);
        assert.ok(t.startsWith('/workspace/'), `${t} rooted under /workspace`);
    }
});

test('MODEL_FAMILY_TOOL_TYPES: every family maps to a non-empty string array', () => {
    for (const [family, tools] of Object.entries(MODEL_FAMILY_TOOL_TYPES)) {
        assert.ok(Array.isArray(tools), `${family} must be array`);
        assert.ok(tools.length > 0, `${family} must have tools`);
        for (const t of tools) {
            assert.equal(typeof t, 'string');
        }
        // All families at minimum advertise file_search + mcp.
        assert.ok(tools.includes('file_search'), `${family} must include file_search`);
        assert.ok(tools.includes('mcp'), `${family} must include mcp`);
    }
});

test('AGENT_TOOL_CONFIG.askUser: has name/description/descriptionDescription + skip/answer copy', () => {
    const a = AGENT_TOOL_CONFIG.askUser;
    assert.equal(a.name, 'ask_user');
    assert.ok(a.description.length > 0);
    assert.ok(a.descriptionDescription.includes('60 chars'));
    assert.ok(a.skippedAnswer.length > 0);
    assert.ok(a.answerPrefix.endsWith(': '));
});

test('TOOL_APP_NAMES: values are unique non-empty route keys', () => {
    const values = Object.values(TOOL_APP_NAMES);
    assert.equal(values.length, new Set(values).size);
    for (const v of values) assert.ok(v.length > 0);
});

test('CONNECTION_TOOL_DESCRIPTIONS + GENERAL_TOOL_DESCRIPTIONS: every entry is a non-empty string', () => {
    for (const group of [CONNECTION_TOOL_DESCRIPTIONS, GENERAL_TOOL_DESCRIPTIONS]) {
        for (const [key, v] of Object.entries(group)) {
            assert.equal(typeof v, 'string', key);
            assert.ok(v.length > 0, key);
        }
    }
});

test('SKILL_NAME_PATTERN: allows letters/numbers/-/_; rejects spaces and punctuation', () => {
    assert.ok(SKILL_NAME_PATTERN.test('my-skill'));
    assert.ok(SKILL_NAME_PATTERN.test('Skill_123'));
    assert.ok(SKILL_NAME_PATTERN.test('abc'));
    assert.ok(!SKILL_NAME_PATTERN.test('has space'));
    assert.ok(!SKILL_NAME_PATTERN.test('has.dot'));
    assert.ok(!SKILL_NAME_PATTERN.test(''));
    assert.ok(!SKILL_NAME_PATTERN.test('-leading'));
});

test('SKILL_ROOT_DIR_BY_SCOPE: project/user both absolute paths, distinct', () => {
    assert.notEqual(SKILL_ROOT_DIR_BY_SCOPE.project, SKILL_ROOT_DIR_BY_SCOPE.user);
    assert.ok(SKILL_ROOT_DIR_BY_SCOPE.project.startsWith('/workspace/'));
    assert.ok(SKILL_ROOT_DIR_BY_SCOPE.user.startsWith('/workspace/'));
});
