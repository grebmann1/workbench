import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeSkillName,
    getSkillNameError,
    resolveSkillRoot,
    buildSkillMarkdown,
    saveSkillToFs,
} from '../modules/skillUtils.ts';

test('normalizeSkillName: trims whitespace and coerces null-ish to empty string', () => {
    assert.equal(normalizeSkillName('  hello  '), 'hello');
    assert.equal(normalizeSkillName(''), '');
    assert.equal(normalizeSkillName(undefined as unknown as string), '');
});

test('getSkillNameError: flags missing and invalid names', () => {
    assert.match(getSkillNameError('') ?? '', /required/i);
    assert.match(getSkillNameError('has space') ?? '', /letters, numbers/i);
    assert.match(getSkillNameError('-leading-dash') ?? '', /letters, numbers/i);
});

test('getSkillNameError: returns null for valid names', () => {
    assert.equal(getSkillNameError('my-skill'), null);
    assert.equal(getSkillNameError('ABC_123'), null);
});

test('resolveSkillRoot: default scope is project', () => {
    const { scope, rootDir } = resolveSkillRoot(undefined);
    assert.equal(scope, 'project');
    assert.match(rootDir, /custom-skills$/);
});

test('resolveSkillRoot: user scope resolves to user skills directory', () => {
    const { scope, rootDir } = resolveSkillRoot('user');
    assert.equal(scope, 'user');
    assert.match(rootDir, /\.cursor\/skills$/);
});

test('buildSkillMarkdown: produces YAML frontmatter + body', () => {
    const md = buildSkillMarkdown({
        name: 'demo',
        description: 'A short description',
        content: 'Hello world',
    });
    assert.match(md, /^---\nname: demo\ndescription: A short description\n---\nHello world\n$/);
});

test('buildSkillMarkdown: multiline descriptions use YAML block-scalar', () => {
    const md = buildSkillMarkdown({
        name: 'n',
        description: 'line one\nline two',
        content: 'body',
    });
    assert.match(md, /description: \|\n {2}line one\n {2}line two\n/);
});

test('buildSkillMarkdown: descriptions with colons or hashes get quoted', () => {
    const md = buildSkillMarkdown({
        name: 'n',
        description: 'has: a colon',
        content: 'b',
    });
    assert.match(md, /description: "has: a colon"/);
});

test('saveSkillToFs: rejects when filesystem lacks write capabilities', async () => {
    const result = await saveSkillToFs({}, {
        name: 'n',
        description: 'd',
        content: 'c',
    });
    assert.equal(result.ok, false);
    assert.match(result.error ?? '', /does not support write/i);
});

test('saveSkillToFs: rejects invalid names before touching filesystem', async () => {
    const calls: string[] = [];
    const fs = {
        writeFile: async () => {
            calls.push('writeFile');
        },
        mkdir: async () => {
            calls.push('mkdir');
        },
    };
    const r = await saveSkillToFs(fs, { name: 'bad name', description: 'd', content: 'c' });
    assert.equal(r.ok, false);
    assert.equal(calls.length, 0);
});

test('saveSkillToFs: rejects empty description / content', async () => {
    const fs = { writeFile: async () => {}, mkdir: async () => {} };
    const r1 = await saveSkillToFs(fs, { name: 'ok', description: '', content: 'c' });
    assert.match(r1.error ?? '', /description is required/i);
    const r2 = await saveSkillToFs(fs, { name: 'ok', description: 'd', content: '' });
    assert.match(r2.error ?? '', /content is required/i);
});

test('saveSkillToFs: writes SKILL.md under resolved root and returns ok', async () => {
    const writes: Array<[string, string]> = [];
    const mkdirs: string[] = [];
    const fs = {
        writeFile: async (p: string, c: string) => {
            writes.push([p, c]);
        },
        mkdir: async (p: string) => {
            mkdirs.push(p);
        },
        exists: async () => false,
    };
    const r = await saveSkillToFs(fs, {
        name: 'hello',
        description: 'desc',
        content: 'body',
        scope: 'user',
    });
    assert.equal(r.ok, true);
    assert.equal(r.scope, 'user');
    assert.match(r.skillPath ?? '', /\.cursor\/skills\/hello\/SKILL\.md$/);
    assert.equal(writes.length, 1);
    assert.equal(mkdirs.length, 1);
});

test('saveSkillToFs: refuses to overwrite by default, allows with --overwrite', async () => {
    const fs = {
        writeFile: async () => {},
        mkdir: async () => {},
        exists: async () => true,
    };
    const denied = await saveSkillToFs(fs, {
        name: 'hi',
        description: 'd',
        content: 'c',
    });
    assert.equal(denied.ok, false);
    assert.match(denied.error ?? '', /already exists/i);

    const allowed = await saveSkillToFs(fs, {
        name: 'hi',
        description: 'd',
        content: 'c',
        overwrite: true,
    });
    assert.equal(allowed.ok, true);
});
