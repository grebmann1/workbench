import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodeExecStdout } from '../execStdout.ts';

/**
 * just-bash's `cat` returns file contents as a "binary string" (one char per
 * raw byte) and sets stdoutEncoding: "binary". This helper simulates that: it
 * takes real text, UTF-8-encodes it, and spreads the bytes one-per-char — the
 * exact shape decodeExecStdout receives from `cat report.md`.
 */
function asBinaryString(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
}

test('decodeExecStdout: recovers UTF-8 text from binary-encoded stdout (emoji + em dash)', () => {
    const original = '# 🔍 Solaris Claims Agent — Dependency Audit Report';
    const res = { stdout: asBinaryString(original), stdoutEncoding: 'binary' };

    // Without decoding, the binary string is the mojibake we see in reports.
    // With the fix, it round-trips back to the original text.
    assert.equal(decodeExecStdout(res), original);
});

test('decodeExecStdout: leaves plain (non-binary) stdout untouched', () => {
    const res = { stdout: 'hello world\n', stdoutEncoding: undefined };
    assert.equal(decodeExecStdout(res), 'hello world\n');
});

test('decodeExecStdout: does not corrupt ASCII-only binary output', () => {
    const res = { stdout: asBinaryString('plain ascii text'), stdoutEncoding: 'binary' };
    assert.equal(decodeExecStdout(res), 'plain ascii text');
});

test('decodeExecStdout: recovers 2-byte and 3-byte sequences (accents + curly quotes)', () => {
    const original = 'café “naïve” — résumé';
    const res = { stdout: asBinaryString(original), stdoutEncoding: 'binary' };
    assert.equal(decodeExecStdout(res), original);
});

test('decodeExecStdout: invalid UTF-8 bytes decode to U+FFFD (genuine binary, e.g. cat image.png)', () => {
    // 0xFF and 0xFE are never valid UTF-8 lead bytes; a trailing 0x41 ("A") is.
    const res = { stdout: String.fromCharCode(0xff, 0xfe, 0x41), stdoutEncoding: 'binary' };
    const out = decodeExecStdout(res);
    // The correct display fallback: each bad byte becomes the replacement char,
    // valid ASCII survives — never a thrown error or dropped output.
    assert.equal(out, '��A');
});

test('decodeExecStdout: handles empty / missing stdout', () => {
    assert.equal(decodeExecStdout({ stdoutEncoding: 'binary' }), '');
    assert.equal(decodeExecStdout({ stdout: '' }), '');
});
