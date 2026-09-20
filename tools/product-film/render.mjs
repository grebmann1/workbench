import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { chromium } from 'playwright';
import { createServer } from '../../apps/ui/node_modules/vite/dist/node/index.js';
import {
    CHAPTERS,
    FILM_DURATION,
    FILM_WIDTH,
    FILM_HEIGHT,
} from '../../apps/ui/src/product-film/story.ts';
import { writeScore } from './score.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = Object.fromEntries(
    process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('='))
);
const width = Number(options.width ?? FILM_WIDTH);
const fps = Number(options.fps ?? 30);
const height = (width * FILM_HEIGHT) / FILM_WIDTH;
if (
    !Number.isInteger(width) ||
    width < 640 ||
    width > 3840 ||
    width % 2 ||
    !Number.isInteger(height) ||
    height % 2 ||
    !Number.isInteger(fps) ||
    fps < 1 ||
    fps > 60
) {
    throw new Error(
        'Use an even 16:9 resolution (e.g. --width=1920 or --width=1280) and an integer --fps=1..60.'
    );
}
const output = resolve(root, options.out ?? 'out/product-film');
await mkdir(output, { recursive: true });
await mkdir(resolve(output, 'stills'), { recursive: true });

function subtitleTime(seconds) {
    return new Date(seconds * 1000).toISOString().slice(11, 23).replace('.', ',');
}
let subtitleIndex = 0;
const subtitles = CHAPTERS.flatMap(chapter =>
    chapter.captions.map((text, index) => {
        const length = (chapter.end - chapter.start) / chapter.captions.length;
        return `${++subtitleIndex}\n${subtitleTime(chapter.start + index * length)} --> ${subtitleTime(chapter.start + (index + 1) * length)}\n${text}\n`;
    })
).join('\n');
await writeFile(resolve(output, 'workbench-tour.srt'), subtitles);
await writeFile(
    resolve(output, 'transcript.md'),
    '# Workbench 2.0 product film\n\n' +
        CHAPTERS.map(chapter => `## ${chapter.label}\n\n${chapter.captions.join(' ')}\n`).join('\n')
);
console.log('Composing original soundtrack…');
await writeScore(resolve(output, 'soundtrack.wav'), FILM_DURATION);

let browser;
let server;
let encoder;
try {
    server = await createServer({
        root: resolve(root, 'apps/ui'),
        configFile: resolve(root, 'apps/ui/vite.config.ts'),
        server: { host: '127.0.0.1', port: 0, open: false },
        logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string')
        throw new Error('Could not determine preview port.');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}/film?capture=1`, {
        waitUntil: 'networkidle',
    });
    await page.waitForFunction(() => Boolean(window.workbenchFilm));
    await page.evaluate(() => document.fonts.ready);

    const seek = async seconds => {
        await page.evaluate(time => window.workbenchFilm.seek(time), seconds);
    };
    await seek(3.2);
    await page.screenshot({ path: resolve(output, 'poster.png') });
    for (const [index, chapter] of CHAPTERS.entries()) {
        await seek(chapter.start + (chapter.end - chapter.start) * 0.73);
        await page.screenshot({
            path: resolve(output, `stills/${String(index + 1).padStart(2, '0')}-${chapter.id}.png`),
        });
    }

    const frames = Math.round(FILM_DURATION * fps);
    encoder = spawn(
        'ffmpeg',
        [
            '-hide_banner',
            '-loglevel',
            'error',
            '-y',
            '-f',
            'image2pipe',
            '-framerate',
            String(fps),
            '-vcodec',
            'mjpeg',
            '-i',
            'pipe:0',
            '-i',
            resolve(output, 'soundtrack.wav'),
            '-i',
            resolve(output, 'workbench-tour.srt'),
            '-map',
            '0:v',
            '-map',
            '1:a',
            '-map',
            '2:s',
            '-c:v',
            'libx264',
            '-preset',
            'medium',
            '-crf',
            '18',
            '-pix_fmt',
            'yuv420p',
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-af',
            'loudnorm=I=-23:TP=-2:LRA=7',
            '-c:s',
            'mov_text',
            '-metadata:s:s:0',
            'language=eng',
            '-disposition:s:0',
            '0',
            '-t',
            String(FILM_DURATION),
            '-movflags',
            '+faststart',
            '-metadata',
            'title=Workbench 2.0 — A few of the possibilities',
            '-metadata',
            'comment=Illustrative product demo with sample data. Original synthesized soundtrack.',
            resolve(output, 'workbench-tour.mp4'),
        ],
        { stdio: ['pipe', 'ignore', 'pipe'] }
    );
    let encoderError = '';
    encoder.stderr.on('data', chunk => {
        encoderError = (encoderError + chunk.toString()).slice(-8000);
    });
    const completed = new Promise((resolveResult, reject) => {
        encoder.on('error', reject);
        encoder.on('close', code =>
            code === 0
                ? resolveResult()
                : reject(new Error(`FFmpeg exited ${code}: ${encoderError}`))
        );
    });
    completed.catch(() => {});
    const started = performance.now();
    const captureFrames = async function* () {
        for (let frame = 0; frame < frames; frame++) {
            await seek(frame / fps);
            yield await page.screenshot({ type: 'jpeg', quality: 95 });
            if (frame % (fps * 5) === 0)
                console.log(
                    `${Math.round((frame / frames) * 100)}% · ${frame}/${frames} frames · ${Math.round((performance.now() - started) / 1000)}s elapsed`
                );
            if (pageErrors.length) throw new Error(pageErrors.join('\n'));
        }
    };
    await pipeline(Readable.from(captureFrames()), encoder.stdin);
    await completed;
    console.log(
        `Saved ${resolve(output, 'workbench-tour.mp4')} (${width}×${height}, ${fps}fps, ${FILM_DURATION}s)`
    );
} finally {
    if (encoder && encoder.exitCode === null) encoder.kill();
    await browser?.close();
    await server?.close();
}
