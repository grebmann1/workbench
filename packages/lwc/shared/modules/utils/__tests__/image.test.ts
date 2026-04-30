import assert from 'node:assert/strict';
import { test } from 'node:test';

type LoadedImage = {
    naturalWidth: number;
    naturalHeight: number;
    src?: string;
    onload: (() => void) | null;
    onerror: (() => void) | null;
};

let lastImage: LoadedImage | null = null;
let nextImageShouldFail = false;
let nextNaturalWidth = 100;
let nextNaturalHeight = 50;

class FakeImage {
    naturalWidth = nextNaturalWidth;
    naturalHeight = nextNaturalHeight;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    private _src = '';
    get src() {
        return this._src;
    }
    set src(value: string) {
        this._src = value;
        queueMicrotask(() => {
            if (nextImageShouldFail) {
                this.onerror?.();
            } else {
                this.onload?.();
            }
        });
    }
    constructor() {
        lastImage = this as unknown as LoadedImage;
    }
}

type FakeContext = {
    drawImage: (...args: unknown[]) => void;
    lastDraw: unknown[] | null;
};

type FakeCanvas = {
    width: number;
    height: number;
    getContext: (type: string) => FakeContext | null;
    toDataURL: (format?: string, quality?: number) => string;
    _ctx: FakeContext | null;
    _lastFormat: string | undefined;
    _lastQuality: number | undefined;
};

let lastCanvas: FakeCanvas | null = null;
let returnNullContext = false;

Object.defineProperty(globalThis, 'Image', {
    value: FakeImage,
    writable: true,
    configurable: true,
});

Object.defineProperty(globalThis, 'document', {
    value: {
        createElement(tag: string) {
            if (tag !== 'canvas') throw new Error(`unexpected tag: ${tag}`);
            const canvas: FakeCanvas = {
                width: 0,
                height: 0,
                _ctx: null,
                _lastFormat: undefined,
                _lastQuality: undefined,
                getContext(type: string) {
                    if (returnNullContext) return null;
                    if (type !== '2d') return null;
                    const ctx: FakeContext = {
                        lastDraw: null,
                        drawImage(...args) {
                            ctx.lastDraw = args;
                        },
                    };
                    canvas._ctx = ctx;
                    return ctx;
                },
                toDataURL(format?: string, quality?: number) {
                    canvas._lastFormat = format;
                    canvas._lastQuality = quality;
                    return `data:${format ?? 'image/png'};base64,ENCODED@${canvas.width}x${canvas.height}@q${quality}`;
                },
            };
            lastCanvas = canvas;
            return canvas;
        },
    },
    writable: true,
    configurable: true,
});

const { compressImage } = await import('../image.ts');

test('compressImage: defaults to jpeg, quality 0.8, scale 1.0', async () => {
    nextImageShouldFail = false;
    returnNullContext = false;
    nextNaturalWidth = 200;
    nextNaturalHeight = 100;

    const result = await compressImage('data:image/png;base64,abc');
    assert.equal(result.mimeType, 'image/jpeg');
    assert.ok(result.dataUrl.startsWith('data:image/jpeg;base64,'));
    assert.equal(lastCanvas!.width, 200);
    assert.equal(lastCanvas!.height, 100);
    assert.equal(lastCanvas!._lastFormat, 'image/jpeg');
    assert.equal(lastCanvas!._lastQuality, 0.8);
});

test('compressImage: applies scale, rounding to integers', async () => {
    nextImageShouldFail = false;
    nextNaturalWidth = 101;
    nextNaturalHeight = 51;

    await compressImage('data:image/png;base64,abc', { scale: 0.5 });
    assert.equal(lastCanvas!.width, 51);
    assert.equal(lastCanvas!.height, 26);
});

test('compressImage: clamps minimum canvas dimension to 1px', async () => {
    nextImageShouldFail = false;
    nextNaturalWidth = 1;
    nextNaturalHeight = 1;

    await compressImage('data:image/png;base64,abc', { scale: 0.01 });
    assert.equal(lastCanvas!.width, 1);
    assert.equal(lastCanvas!.height, 1);
});

test('compressImage: honors explicit format + quality', async () => {
    nextImageShouldFail = false;
    nextNaturalWidth = 10;
    nextNaturalHeight = 10;

    const result = await compressImage('data:image/png;base64,abc', {
        format: 'image/webp',
        quality: 0.42,
    });
    assert.equal(result.mimeType, 'image/webp');
    assert.equal(lastCanvas!._lastFormat, 'image/webp');
    assert.equal(lastCanvas!._lastQuality, 0.42);
});

test('compressImage: normalizes invalid scale back to 1.0', async () => {
    nextImageShouldFail = false;
    nextNaturalWidth = 40;
    nextNaturalHeight = 20;

    await compressImage('data:image/png;base64,abc', { scale: -5 });
    assert.equal(lastCanvas!.width, 40);
    assert.equal(lastCanvas!.height, 20);
});

test('compressImage: normalizes out-of-range quality back to 0.8', async () => {
    nextImageShouldFail = false;
    nextNaturalWidth = 10;
    nextNaturalHeight = 10;

    await compressImage('data:image/png;base64,abc', { quality: 5 });
    assert.equal(lastCanvas!._lastQuality, 0.8);
});

test('compressImage: rejects when image fails to load', async () => {
    nextImageShouldFail = true;
    await assert.rejects(() => compressImage('data:image/png;base64,bad'), /Failed to load image/);
    nextImageShouldFail = false;
});

test('compressImage: throws when 2D context cannot be acquired', async () => {
    nextImageShouldFail = false;
    returnNullContext = true;
    nextNaturalWidth = 10;
    nextNaturalHeight = 10;

    await assert.rejects(
        () => compressImage('data:image/png;base64,abc'),
        /Failed to get 2D context/
    );
    returnNullContext = false;
});
