const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { collectSkillPaths, buildManifest } = require('../generate_manifest_skill.js');

function mkSkillsTree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));
    for (const [relPath, body] of Object.entries(files)) {
        const full = path.join(root, relPath);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, body ?? '# skill');
    }
    return root;
}

test('collectSkillPaths: empty directory yields empty list', () => {
    const root = mkSkillsTree({});
    assert.deepEqual(collectSkillPaths(root, root), []);
});

test('collectSkillPaths: top-level *.SKILL.md files are collected', () => {
    const root = mkSkillsTree({
        'alpha.SKILL.md': null,
        'beta.SKILL.md': null,
    });
    assert.deepEqual(collectSkillPaths(root, root), ['alpha.SKILL.md', 'beta.SKILL.md']);
});

test('collectSkillPaths: nested *.SKILL.md files are collected with forward slashes', () => {
    const root = mkSkillsTree({
        'foo/bar/deep.SKILL.md': null,
        'foo/mid.SKILL.md': null,
        'top.SKILL.md': null,
    });
    const paths = collectSkillPaths(root, root);
    assert.deepEqual(paths, ['foo/bar/deep.SKILL.md', 'foo/mid.SKILL.md', 'top.SKILL.md']);
    paths.forEach(p => assert.ok(!p.includes('\\')));
});

test('collectSkillPaths: non-SKILL files and README are ignored', () => {
    const root = mkSkillsTree({
        'real.SKILL.md': null,
        'README.md': null,
        'notes.txt': null,
        'sub/other.md': null,
    });
    assert.deepEqual(collectSkillPaths(root, root), ['real.SKILL.md']);
});

test('collectSkillPaths: results are sorted', () => {
    const root = mkSkillsTree({
        'zeta.SKILL.md': null,
        'alpha.SKILL.md': null,
        'middle/mike.SKILL.md': null,
    });
    assert.deepEqual(collectSkillPaths(root, root), [
        'alpha.SKILL.md',
        'middle/mike.SKILL.md',
        'zeta.SKILL.md',
    ]);
});

test('buildManifest: wraps skills with comment banner and array', () => {
    const root = mkSkillsTree({ 'one.SKILL.md': null, 'two.SKILL.md': null });
    const manifest = buildManifest(root);
    assert.equal(typeof manifest._comment, 'string');
    assert.match(manifest._comment, /Auto-generated/);
    assert.deepEqual(manifest.skills, ['one.SKILL.md', 'two.SKILL.md']);
});

test('buildManifest: empty skills tree still emits well-formed manifest', () => {
    const root = mkSkillsTree({});
    const manifest = buildManifest(root);
    assert.deepEqual(manifest.skills, []);
    assert.ok(manifest._comment);
});
