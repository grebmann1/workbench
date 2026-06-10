import assert from 'node:assert/strict';
import { test } from 'node:test';

type FileLike = { name: string; size: number; type: string; _content: string };

class FakeFileReader {
    onload: ((e: { target: { result: string } }) => void) | null = null;
    result: string | null = null;
    _target: { result: string } | null = null;
    readAsText(file: FileLike) {
        queueMicrotask(() => {
            this._target = { result: `TEXT:${file._content}` };
            this.onload?.({ target: this._target });
        });
    }
    readAsDataURL(file: FileLike) {
        queueMicrotask(() => {
            this._target = {
                result: `data:${file.type};base64,${Buffer.from(file._content).toString('base64')}`,
            };
            this.onload?.({ target: this._target });
        });
    }
}

Object.defineProperty(globalThis, 'FileReader', {
    value: FakeFileReader,
    writable: true,
    configurable: true,
});

const { readFileContent } = await import('../readFileContent.ts');

function makeFile(opts: { name: string; type: string; size: number; content?: string }): FileLike {
    return {
        name: opts.name,
        type: opts.type,
        size: opts.size,
        _content: opts.content ?? '',
    };
}

test('readFileContent: returns truncated payload for files > 20MB', async () => {
    const big = makeFile({
        name: 'big.bin',
        type: 'application/octet-stream',
        size: 25 * 1024 * 1024,
    });
    const result = (await readFileContent(big as any)) as any;
    assert.equal(result.name, 'big.bin');
    assert.equal(result.content, null);
    assert.match(result.note, /too large/i);
});

test('readFileContent: reads text/* via readAsText', async () => {
    const file = makeFile({ name: 'a.txt', type: 'text/plain', size: 5, content: 'hello' });
    const result = (await readFileContent(file as any)) as any;
    assert.equal(result.name, 'a.txt');
    assert.equal(result.type, 'text/plain');
    assert.equal(result.content, 'TEXT:hello');
});

test('readFileContent: reads application/json via readAsText', async () => {
    const file = makeFile({ name: 'x.json', type: 'application/json', size: 2, content: '{}' });
    const result = (await readFileContent(file as any)) as any;
    assert.equal(result.content, 'TEXT:{}');
});

test('readFileContent: reads binary types as data URL', async () => {
    const file = makeFile({ name: 'img.png', type: 'image/png', size: 4, content: 'PNG!' });
    const result = (await readFileContent(file as any)) as any;
    assert.ok(result.content.startsWith('data:image/png;base64,'));
    assert.equal(result.name, 'img.png');
});

test('readFileContent: preserves size/type metadata', async () => {
    const file = makeFile({ name: 'a.txt', type: 'text/plain', size: 42, content: 'x' });
    const result = (await readFileContent(file as any)) as any;
    assert.equal(result.size, 42);
    assert.equal(result.type, 'text/plain');
});
