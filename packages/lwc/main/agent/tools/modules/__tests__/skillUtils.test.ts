import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    normalizeSkillName,
    getSkillNameError,
    resolveSkillRoot,
    buildSkillMarkdown,
    saveSkillToFs,
    deleteSkillFromFs,
} from '../skillUtils.ts';

test('normalizeSkillName: trims and coerces to string', () => {
    assert.equal(normalizeSkillName('  foo  '), 'foo');
    assert.equal(normalizeSkillName(null as any), '');
});

test('getSkillNameError: rejects empty', () => {
    assert.equal(getSkillNameError(''), 'Skill name is required.');
});

test('getSkillNameError: rejects invalid chars', () => {
    assert.match(getSkillNameError('has spaces')!, /letters, numbers, hyphens, or underscores/);
    assert.match(getSkillNameError('has/slash')!, /hyphens/);
});

test('getSkillNameError: accepts letters/digits/hyphen/underscore', () => {
    assert.equal(getSkillNameError('my-skill_1'), null);
    assert.equal(getSkillNameError('ABC123'), null);
});

test('resolveSkillRoot: defaults to project scope', () => {
    assert.equal(resolveSkillRoot().scope, 'project');
    assert.equal(resolveSkillRoot().rootDir, '/workspace/skills/custom-skills');
});

test('resolveSkillRoot: user scope', () => {
    const out = resolveSkillRoot('user');
    assert.equal(out.scope, 'user');
    assert.equal(out.rootDir, '/workspace/.cursor/skills');
});

test('buildSkillMarkdown: frontmatter block + content', () => {
    const md = buildSkillMarkdown({
        name: 'my-skill',
        description: 'does a thing',
        content: 'body text',
    });
    assert.match(md, /^---\nname: my-skill\ndescription: does a thing\n---\nbody text\n$/);
});

test('buildSkillMarkdown: description containing colon is quoted', () => {
    const md = buildSkillMarkdown({
        name: 'x',
        description: 'needs: quoting',
        content: 'c',
    });
    assert.match(md, /description: "needs: quoting"/);
});

test('buildSkillMarkdown: multiline description uses literal block scalar', () => {
    const md = buildSkillMarkdown({
        name: 'x',
        description: 'line1\nline2',
        content: 'c',
    });
    assert.match(md, /description: \|\n {2}line1\n {2}line2/);
});

test('saveSkillToFs: no writeFile support → ok:false', async () => {
    const out = await saveSkillToFs({} as any, {
        name: 'a',
        description: 'b',
        content: 'c',
    });
    assert.equal(out.ok, false);
});

test('saveSkillToFs: invalid name error bubbles', async () => {
    const fs = { writeFile: async () => {}, mkdir: async () => {} };
    const out = await saveSkillToFs(fs, {
        name: 'bad name',
        description: 'x',
        content: 'y',
    });
    assert.equal(out.ok, false);
    assert.match((out as any).error, /hyphens/);
});

test('saveSkillToFs: missing description / content rejects', async () => {
    const fs = { writeFile: async () => {}, mkdir: async () => {} };
    const noDesc = await saveSkillToFs(fs, { name: 'a', description: '', content: 'c' });
    assert.equal(noDesc.ok, false);
    const noContent = await saveSkillToFs(fs, { name: 'a', description: 'd', content: '' });
    assert.equal(noContent.ok, false);
});

test('saveSkillToFs: writes SKILL.md when all valid', async () => {
    const writes: any[] = [];
    const mkdirs: any[] = [];
    const fs = {
        exists: async () => false,
        mkdir: async (path: string, opts: any) => {
            mkdirs.push({ path, opts });
        },
        writeFile: async (path: string, content: string) => {
            writes.push({ path, content });
        },
    };
    const out = await saveSkillToFs(fs, {
        name: 'alpha',
        description: 'desc',
        content: 'body',
    });
    assert.equal(out.ok, true);
    assert.equal((out as any).skillPath, '/workspace/skills/custom-skills/alpha/SKILL.md');
    assert.equal(writes.length, 1);
    assert.match(writes[0].content, /name: alpha/);
});

test('saveSkillToFs: existing skill without overwrite → ok:false', async () => {
    const fs = {
        exists: async () => true,
        mkdir: async () => {},
        writeFile: async () => {},
    };
    const out = await saveSkillToFs(fs, {
        name: 'alpha',
        description: 'd',
        content: 'c',
    });
    assert.equal(out.ok, false);
    assert.match((out as any).error, /already exists/);
});

test('saveSkillToFs: overwrite=true bypasses existence check', async () => {
    let wrote = false;
    const fs = {
        exists: async () => true,
        mkdir: async () => {},
        writeFile: async () => {
            wrote = true;
        },
    };
    const out = await saveSkillToFs(fs, {
        name: 'alpha',
        description: 'd',
        content: 'c',
        overwrite: true,
    });
    assert.equal(out.ok, true);
    assert.equal(wrote, true);
});

test('deleteSkillFromFs: missing rm support → ok:false', async () => {
    const out = await deleteSkillFromFs({} as any, { name: 'a' });
    assert.equal(out.ok, false);
});

test('deleteSkillFromFs: invalid name error bubbles', async () => {
    const fs = { rm: async () => {}, exists: async () => true };
    const out = await deleteSkillFromFs(fs, { name: 'bad name' });
    assert.equal(out.ok, false);
    assert.match((out as any).error, /hyphens/);
});

test('deleteSkillFromFs: missing skill returns ok:false', async () => {
    const fs = { rm: async () => {}, exists: async () => false };
    const out = await deleteSkillFromFs(fs, { name: 'alpha' });
    assert.equal(out.ok, false);
    assert.match((out as any).error, /not found/);
});

test('deleteSkillFromFs: removes file and directory on success', async () => {
    const removed: Array<{ path: string; opts?: any }> = [];
    const fs = {
        exists: async () => true,
        rm: async (path: string, opts?: any) => {
            removed.push({ path, opts });
        },
    };
    const out = await deleteSkillFromFs(fs, { name: 'alpha' });
    assert.equal(out.ok, true);
    assert.equal((out as any).skillPath, '/workspace/skills/custom-skills/alpha/SKILL.md');
    assert.equal(removed.length, 2);
    assert.equal(removed[0].path, '/workspace/skills/custom-skills/alpha/SKILL.md');
    assert.equal(removed[1].path, '/workspace/skills/custom-skills/alpha');
    assert.equal(removed[1].opts?.recursive, true);
});

test('deleteSkillFromFs: user scope targets /workspace/.cursor/skills', async () => {
    const removed: string[] = [];
    const fs = {
        exists: async () => true,
        rm: async (path: string) => {
            removed.push(path);
        },
    };
    const out = await deleteSkillFromFs(fs, { name: 'alpha', scope: 'user' });
    assert.equal(out.ok, true);
    assert.equal((out as any).skillPath, '/workspace/.cursor/skills/alpha/SKILL.md');
    assert.deepEqual(removed, [
        '/workspace/.cursor/skills/alpha/SKILL.md',
        '/workspace/.cursor/skills/alpha',
    ]);
});
