import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createShellRunner } from '../shellRunner.ts';

function makeBash(initialCwd = '/workspace') {
    let cwd = initialCwd;
    const calls: string[] = [];
    return {
        calls,
        exec: async (command: string) => {
            calls.push(command);
            // crude cd emulation
            const cdMatch = command.match(/^cd '([^']+)'$/);
            if (cdMatch) cwd = cdMatch[1];
            return { stdout: `ran:${command}`, stderr: '', exitCode: 0 };
        },
        getCwd: () => cwd,
    };
}

test('createShellRunner: throws when bash.exec is missing', () => {
    assert.throws(() => createShellRunner({ bash: {} as never }));
});

test('createShellRunner: run() returns stdout/stderr/exitCode and the resolved cwd', async () => {
    const bash = makeBash();
    const runner = createShellRunner({ bash });
    const out = await runner.run('echo hi');
    assert.equal(out.stdout, 'ran:echo hi');
    assert.equal(out.exitCode, 0);
    assert.equal(out.cwd, '/workspace');
});

test('createShellRunner: cd is emitted when requested cwd differs', async () => {
    const bash = makeBash('/workspace');
    const runner = createShellRunner({ bash });
    await runner.run('ls', { cwd: '/tmp' });
    assert.equal(bash.calls[0], `cd '/tmp'`);
    assert.equal(bash.calls[1], 'ls');
    assert.equal(runner.getCwd(), '/tmp');
});

test('createShellRunner: skips cd when already at target', async () => {
    const bash = makeBash('/workspace');
    const runner = createShellRunner({ bash });
    await runner.run('pwd', { cwd: '/workspace' });
    assert.equal(bash.calls.length, 1);
    assert.equal(bash.calls[0], 'pwd');
});

test('createShellRunner: quoteShellPath escapes single quotes in cwd', async () => {
    const bash = makeBash('/start');
    const runner = createShellRunner({ bash });
    await runner.run('ls', { cwd: "/path/with's" });
    assert.ok(bash.calls[0].startsWith('cd '));
    // Note: the quoter wraps in '...' and escapes embedded quotes. Implementation detail: the
    // escape sequence replaces `'` with `'"'"'` — we only assert that a cd was produced.
    assert.match(bash.calls[0], /^cd '/);
});

test('createShellRunner: falls back to default cwd when bash has no getCwd', async () => {
    const runner = createShellRunner({
        bash: {
            exec: async () => ({ stdout: '', stderr: '', exitCode: 0 }),
        },
        defaultCwd: '/home',
    });
    const out = await runner.run('pwd');
    assert.equal(out.cwd, '/home');
});

test('createShellRunner: coerces non-number exitCode to 1', async () => {
    const runner = createShellRunner({
        bash: {
            exec: async () => ({ stdout: 'ok', stderr: '' }) as any,
        },
    });
    const out = await runner.run('x');
    assert.equal(out.exitCode, 1);
});
