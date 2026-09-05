import assert from 'node:assert/strict';
import { test } from 'node:test';

import { loadJsCode, parseJsArgs } from '../jsCommand.ts';

function mockCtx(overrides: { stdin?: string; files?: Record<string, string> } = {}) {
    const files = overrides.files || {};
    return {
        cwd: '/workspace',
        stdin: overrides.stdin,
        fs: {
            resolvePath: (_cwd: string, path: string) =>
                path.startsWith('/') ? path : `/workspace/${path}`,
            readFile: async (path: string) => {
                const content = files[path];
                if (content == null) throw new Error(`missing ${path}`);
                return content;
            },
        },
    };
}

test('loadJsCode: no args uses stdin (heredoc)', async () => {
    const result = await loadJsCode([], mockCtx({ stdin: 'const x = 1;\nreturn x;' }));
    assert.equal(result.error, null);
    assert.equal(result.code, 'const x = 1;\nreturn x;');
});

test('loadJsCode: no args and empty stdin prints heredoc usage', async () => {
    const result = await loadJsCode([], mockCtx({ stdin: '  ' }));
    assert.equal(result.code, null);
    assert.ok(result.error);
    assert.equal(result.error.exitCode, 1);
    assert.match(result.error.stderr, /js <<'EOF'/);
});

test('loadJsCode: -e runs inline code', async () => {
    const result = await loadJsCode(['-e', 'return 1+2'], mockCtx());
    assert.equal(result.error, null);
    assert.equal(result.code, 'return 1+2');
});

test('loadJsCode: -e falls back to stdin when inline code is empty', async () => {
    const result = await loadJsCode(['-e'], mockCtx({ stdin: 'return 9' }));
    assert.equal(result.error, null);
    assert.equal(result.code, 'return 9');
});

test('loadJsCode: file path reads the script', async () => {
    const result = await loadJsCode(
        ['/workspace/tmp/script.js'],
        mockCtx({ files: { '/workspace/tmp/script.js': 'return 4;' } })
    );
    assert.equal(result.error, null);
    assert.equal(result.code, 'return 4;');
});

test('parseJsArgs: --timeout is stripped from positional args', () => {
    const parsed = parseJsArgs(['--timeout', '30000', '-e', 'return 1']);
    assert.equal(parsed.error, null);
    assert.equal(parsed.timeoutMs, 30000);
    assert.deepEqual(parsed.argsWithoutFlags, ['-e', 'return 1']);
});
