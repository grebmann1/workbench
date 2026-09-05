import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

test('sandbox.js compiles every eval wrap then executes with SyntaxError fallback', async () => {
    const sandboxPath = fileURLToPath(new URL('../sandbox.js', import.meta.url));
    const src = await readFile(sandboxPath, 'utf8');
    assert.match(src, /function compileSandboxEvalFns/);
    assert.match(src, /function runCompiledSandboxEval/);
    assert.match(src, /return await \$\{source\}/);
    assert.match(src, /compileSandboxEvalFns\(code\)/);
    assert.match(src, /trailing-semicolon/);
});
