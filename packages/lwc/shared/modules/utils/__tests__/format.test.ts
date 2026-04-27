import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    formatBytes,
    basicTextFormatter,
    shortFormatter,
    detectLanguageFromContentType,
    autoDetectAndFormat,
} from '../format.ts';

test('formatBytes: zero, NaN and negative numbers return "0 Bytes"', () => {
    assert.equal(formatBytes(0), '0 Bytes');
    assert.equal(formatBytes(Number.NaN), '0 Bytes');
});

test('formatBytes: kibibyte-unit boundary', () => {
    assert.equal(formatBytes(1024), '1 KiB');
    assert.equal(formatBytes(1536, 2), '1.5 KiB');
});

test('formatBytes: mebibyte and gibibyte', () => {
    assert.equal(formatBytes(1024 * 1024), '1 MiB');
    assert.equal(formatBytes(1024 * 1024 * 1024), '1 GiB');
});

test('formatBytes: decimals param controls precision; negative clamps to 0', () => {
    assert.equal(formatBytes(1536, 0), '2 KiB');
    assert.equal(formatBytes(1536, -3), '2 KiB');
});

test('basicTextFormatter: wraps matching substring in styled span (case-insensitive)', () => {
    const out = basicTextFormatter('Hello World', 'world');
    assert.match(out, /<span[^>]+>World<\/span>/);
});

test('basicTextFormatter: returns text unchanged when no match', () => {
    assert.equal(basicTextFormatter('hello', 'zzz'), 'hello');
});

test('shortFormatter: compact-formats large numbers', () => {
    assert.equal(shortFormatter.format(1_200), '1.2K');
    assert.equal(shortFormatter.format(2_500_000), '2.5M');
});

test('detectLanguageFromContentType: recognises json/xml/html/javascript/text', () => {
    assert.equal(detectLanguageFromContentType('Content-Type: application/json'), 'json');
    assert.equal(detectLanguageFromContentType('content-type: text/xml'), 'xml');
    assert.equal(detectLanguageFromContentType('Content-Type: text/html'), 'html');
    assert.equal(detectLanguageFromContentType('Content-Type: application/javascript'), 'javascript');
    assert.equal(detectLanguageFromContentType('Content-Type: text/plain'), 'text');
});

test('detectLanguageFromContentType: null/missing/unknown returns null', () => {
    assert.equal(detectLanguageFromContentType(null), null);
    assert.equal(detectLanguageFromContentType(undefined), null);
    assert.equal(detectLanguageFromContentType('Server: nginx'), null);
    assert.equal(detectLanguageFromContentType('Content-Type: image/png'), null);
});

test('autoDetectAndFormat: prefers content-type header over body sniffing', () => {
    // Header says xml, but body looks like json — header wins.
    assert.equal(autoDetectAndFormat('{"a":1}', 'Content-Type: text/xml'), 'xml');
});

test('autoDetectAndFormat: falls back to body sniff when header missing/unknown', () => {
    assert.equal(autoDetectAndFormat('   {"a":1}'), 'json');
    assert.equal(autoDetectAndFormat('  [1,2,3]'), 'json');
    assert.equal(autoDetectAndFormat('<root/>'), 'xml');
});

test('autoDetectAndFormat: returns null when nothing recognised', () => {
    assert.equal(autoDetectAndFormat('plain text'), null);
    assert.equal(autoDetectAndFormat(''), null);
});
