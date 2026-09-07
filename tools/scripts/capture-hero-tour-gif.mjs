#!/usr/bin/env node
// tools/scripts/capture-hero-tour-gif.mjs
//
// Records one loop of the production homepage ProductDemo and encodes a
// GitHub-friendly GIF for the README hero. Intermediate video/palette files
// live in a temp dir and are not committed.
//
// Usage: node tools/scripts/capture-hero-tour-gif.mjs
// Requires: ffmpeg. Playwright Chromium or Google Chrome. gifsicle is optional.

import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');

const SITE_URL = process.env.TOUR_GIF_URL || 'https://sf-workbench.com/';
const OUTPUT_GIF = path.join(repoRoot, 'assets/images/screenshots/screenshot-hero.gif');

// Matches FLOW_LOOP_MS in apps/ui/src/product-tour/flow-scene.ts (T_FORM_SUBMIT + 3200).
const FLOW_LOOP_MS = 24_248;
const RECORD_PAD_MS = 500;
const VIEWPORT = { width: 1280, height: 1100 };
const GIF_WIDTH = 900;
const GIF_FPS = 12;
const GIF_PAD_PX = 24;
const TARGET_BYTES = 5 * 1024 * 1024;

const HIDE_CHROME_CSS = `
.announce-bar,
.header,
.hero-full-content,
.product-tour-more,
.feature-section,
.platforms-section,
.faq-section,
.download,
.footer {
    display: none !important;
}
.hero-full,
.hero-full-content,
.home-tour {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
}
.hero-full {
    padding: 12px 0 0 !important;
    gap: 0 !important;
}
html,
body,
.page,
.hero-full,
.home-tour,
.product-tour {
    background: #ffffff !important;
}
`;

function log(msg) {
    process.stdout.write(`[capture-hero-tour-gif] ${msg}\n`);
}

const PATH = ['/opt/homebrew/bin', '/usr/local/bin', process.env.PATH || ''].join(':');

function spawnOpts(extra = {}) {
    return { ...extra, env: { ...process.env, PATH } };
}

function run(command, args) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, spawnOpts({ stdio: 'inherit' }));
        child.on('error', reject);
        child.on('exit', code => {
            if (code === 0) resolve();
            else reject(new Error(`${command} ${args.join(' ')} exited ${code}`));
        });
    });
}

function which(bin) {
    return new Promise(resolve => {
        const child = spawn('which', [bin], spawnOpts({ stdio: 'ignore' }));
        child.on('error', () => resolve(false));
        child.on('exit', code => resolve(code === 0));
    });
}

async function launchBrowser() {
    try {
        return await chromium.launch({ headless: true });
    } catch (err) {
        log(`Playwright Chromium unavailable (${err.message}); using Google Chrome`);
        return await chromium.launch({ channel: 'chrome', headless: true });
    }
}

function even(value) {
    return Math.max(2, Math.floor(value / 2) * 2);
}

async function recordTour(tmpDir) {
    const videoDir = path.join(tmpDir, 'video');
    await mkdir(videoDir, { recursive: true });

    const browser = await launchBrowser();
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: 1,
        recordVideo: { dir: videoDir, size: VIEWPORT },
    });

    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const videoStartedAt = Date.now();

    log(`navigating to ${SITE_URL}`);
    await page.goto(SITE_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.addStyleTag({ content: HIDE_CHROME_CSS });

    const tour = page.locator('[data-tour-demo]');
    await tour.waitFor({ state: 'visible', timeout: 20_000 });
    await page.evaluate(() => document.fonts.ready);
    await tour.evaluate(el => el.scrollIntoView({ block: 'start', inline: 'nearest' }));
    await page.waitForTimeout(200);

    // ProductDemo's elapsed clock starts on mount. Wait for the heading to
    // leave Overlay and return so the recording begins at a loop boundary.
    const heading = page.locator('[data-tour-demo] h2');
    await heading.waitFor({ state: 'visible' });
    log('waiting for the tour loop to wrap at Overlay');
    await page.waitForFunction(
        () => {
            const el = document.querySelector('[data-tour-demo] h2');
            return el && el.textContent && el.textContent.trim() !== 'Overlay';
        },
        null,
        { timeout: 45_000 }
    );
    await page.waitForFunction(
        () => {
            const el = document.querySelector('[data-tour-demo] h2');
            return el && el.textContent && el.textContent.trim() === 'Overlay';
        },
        null,
        { timeout: 45_000 }
    );

    await tour.evaluate(el => el.scrollIntoView({ block: 'start', inline: 'nearest' }));
    const box = await tour.boundingBox();
    if (!box) {
        throw new Error('Could not measure [data-tour-demo] bounding box');
    }
    if (box.height < 400 || box.y + box.height > VIEWPORT.height + 4) {
        throw new Error(
            `Tour is clipped or too short for the viewport: ${JSON.stringify(box)} viewport=${JSON.stringify(VIEWPORT)}`
        );
    }

    const readyAt = Date.now();
    log(`tour visible; recording ${FLOW_LOOP_MS + RECORD_PAD_MS}ms`);
    await page.waitForTimeout(FLOW_LOOP_MS + RECORD_PAD_MS);

    const video = page.video();
    await page.close();
    await context.close();
    await browser.close();

    if (!video) {
        throw new Error('Playwright did not produce a video');
    }

    const videoPath = await video.path();
    const trimStartSec = Math.max(0, (readyAt - videoStartedAt) / 1000);
    log(`video=${videoPath} trimStart=${trimStartSec.toFixed(3)}s crop=${JSON.stringify(box)}`);

    return { videoPath, trimStartSec, box };
}

function cropFilter(box) {
    const x = even(Math.max(0, box.x));
    const y = even(Math.max(0, box.y));
    const width = even(Math.min(VIEWPORT.width - x, box.width));
    const height = even(Math.min(VIEWPORT.height - y, box.height));
    if (height < 400) {
        throw new Error(`Crop height ${height}px is too short (box=${JSON.stringify(box)})`);
    }
    return `crop=${width}:${height}:${x}:${y}`;
}

async function encodeGif(videoPath, trimStartSec, box, tmpDir) {
    const palettePath = path.join(tmpDir, 'palette.png');
    const rawGifPath = path.join(tmpDir, 'hero-raw.gif');
    const durationSec = (FLOW_LOOP_MS / 1000).toFixed(3);
    const crop = cropFilter(box);
    const pad = `pad=iw+${GIF_PAD_PX * 2}:ih+${GIF_PAD_PX * 2}:${GIF_PAD_PX}:${GIF_PAD_PX}:white`;
    const vf = `${crop},fps=${GIF_FPS},scale=${GIF_WIDTH}:-1:flags=lanczos,${pad}`;

    log('generating GIF palette');
    await run('ffmpeg', [
        '-y',
        '-ss',
        String(trimStartSec),
        '-t',
        durationSec,
        '-i',
        videoPath,
        '-vf',
        `${vf},palettegen=stats_mode=full`,
        palettePath,
    ]);

    log('encoding GIF');
    await run('ffmpeg', [
        '-y',
        '-ss',
        String(trimStartSec),
        '-t',
        durationSec,
        '-i',
        videoPath,
        '-i',
        palettePath,
        '-lavfi',
        `${vf}[x];[x][1:v]paletteuse=dither=sierra2_4a`,
        rawGifPath,
    ]);

    return rawGifPath;
}

async function optimizeGif(rawGifPath) {
    await mkdir(path.dirname(OUTPUT_GIF), { recursive: true });

    if (await which('gifsicle')) {
        log('optimizing with gifsicle -O3');
        await run('gifsicle', ['-O3', rawGifPath, '-o', OUTPUT_GIF]);

        let info = await stat(OUTPUT_GIF);
        if (info.size > TARGET_BYTES) {
            log(
                `GIF is ${(info.size / 1024 / 1024).toFixed(2)}MB; retrying with lossy compression`
            );
            await run('gifsicle', ['-O3', '--lossy=40', rawGifPath, '-o', OUTPUT_GIF]);
            info = await stat(OUTPUT_GIF);
        }
        if (info.size > TARGET_BYTES) {
            log('still over 5MB; applying a stronger lossy pass');
            await run('gifsicle', ['-O3', '--lossy=65', rawGifPath, '-o', OUTPUT_GIF]);
        }
        return;
    }

    log('gifsicle not found; copying ffmpeg GIF as-is');
    await run('cp', [rawGifPath, OUTPUT_GIF]);
}

async function main() {
    if (!(await which('ffmpeg'))) {
        throw new Error('ffmpeg is required (brew install ffmpeg)');
    }

    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'hero-tour-gif-'));
    log(`tmp=${tmpDir}`);

    try {
        const { videoPath, trimStartSec, box } = await recordTour(tmpDir);
        const rawGifPath = await encodeGif(videoPath, trimStartSec, box, tmpDir);
        await optimizeGif(rawGifPath);

        const info = await stat(OUTPUT_GIF);
        log(`wrote ${OUTPUT_GIF} (${(info.size / 1024 / 1024).toFixed(2)}MB)`);
        if (info.size > TARGET_BYTES) {
            log(`warning: GIF exceeds 5MB GitHub budget (${info.size} bytes)`);
        }
    } finally {
        await rm(tmpDir, { recursive: true, force: true });
    }
}

main().catch(err => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exit(1);
});
