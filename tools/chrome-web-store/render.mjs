import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from '../../apps/ui/node_modules/vite/dist/node/index.js';
import { SCREENSHOTS, screenshotHtml, promoHtml, reviewHtml } from './artwork.mjs';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.slice(2).find(arg => arg.startsWith('--out='));
const output = resolve(root, outArg?.slice(6) ?? 'out/chrome-web-store');
const css = await readFile(new URL('./artwork.css', import.meta.url), 'utf8');
const iconSource = resolve(root, 'apps/ui/src/product-tour/assets/workbench-logo-128.png');
const asData = bytes => `data:image/png;base64,${bytes.toString('base64')}`;
const icon = asData(await readFile(iconSource));
for (const folder of ['screenshots', 'promotional', 'icon', 'source-ui']) {
    await mkdir(resolve(output, folder), { recursive: true });
}

function pngInfo(bytes) {
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG', 'Expected PNG output');
    return {
        width: bytes.readUInt32BE(16),
        height: bytes.readUInt32BE(20),
        bitDepth: bytes[24],
        colorType: bytes[25],
        bytes: bytes.length,
    };
}

const assets = [];
const errors = [];
const failedAssets = [];
let server;
let browser;
try {
    server = await createServer({
        root: resolve(root, 'apps/ui'),
        configFile: resolve(root, 'apps/ui/vite.config.ts'),
        server: { host: '127.0.0.1', port: 0, open: false },
        logLevel: 'error',
    });
    await server.listen();
    const address = server.httpServer.address();
    if (!address || typeof address === 'string') throw new Error('Missing preview server port');
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
    const source = await browser.newPage({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
    });
    source.on('pageerror', error => errors.push(error.message));
    source.on('response', response => {
        if (response.url().startsWith(origin) && response.status() >= 400) {
            failedAssets.push(`${response.status()} ${response.url()}`);
        }
    });
    const images = {};
    for (const [index, scene] of SCREENSHOTS.entries()) {
        await source.goto(`${origin}/film?capture=1`, { waitUntil: 'networkidle' });
        await source.waitForFunction(() => Boolean(window.workbenchFilm));
        await source.evaluate(time => window.workbenchFilm.seek(time), scene.time);
        // Clone the rendered deterministic UI so the export can use its full-height
        // viewport without changing the film's composition or application source.
        await source.evaluate(() => {
            const screen = document.querySelector('.film-screen');
            if (!screen) throw new Error('Missing shared app preview');
            const clone = screen.cloneNode(true);
            clone.id = 'store-ui';
            const style = document.createElement('style');
            style.textContent = `
                .film-page { display: none !important; }
                #store-ui { position: fixed; left: 0; top: 0; width: 1100px;
                    max-width: none; margin: 0; transform: none !important; }
                #store-ui .pt-stage { height: 540px !important; }
                #store-ui *, #store-ui *::before, #store-ui *::after {
                    animation: none !important; transition: none !important; }
                #store-ui .pt-caret, #store-ui .pt-cursor { display: none !important; }
            `;
            document.head.append(style);
            document.body.append(clone);
            const thread = clone.querySelector('.ap-agent-thread');
            if (thread) thread.scrollTop = thread.scrollHeight;
        });
        await source.evaluate(() => document.fonts.ready);
        const surface = source.locator('#store-ui');
        const geometry = await surface.boundingBox();
        assert.equal(geometry?.width, 1100);
        assert.equal(geometry?.height, 575);
        if (scene.id === 'soql')
            assert.equal(await surface.locator('.ap-results-table tbody tr').count(), 3);
        if (scene.id === 'agent') {
            assert.equal(await surface.locator('.ap-agent-answer').count(), 1);
            const visible = await surface.evaluate(el => {
                const thread = el.querySelector('.ap-agent-thread').getBoundingClientRect();
                const answer = el.querySelector('.ap-agent-answer').getBoundingClientRect();
                return answer.top >= thread.top && answer.bottom <= thread.bottom;
            });
            assert.ok(visible, 'Agent result must be visible in the screenshot');
        }
        const png = await surface.screenshot();
        assert.deepEqual([pngInfo(png).width, pngInfo(png).height], [2200, 1150]);
        images[scene.id] = asData(png);
        await writeFile(resolve(output, `source-ui/0${index + 1}-${scene.id}-2200x1150.png`), png);
        console.log(`Captured ${scene.label} from the shared app preview`);
    }
    await source.goto(`${origin}/film?capture=1`, { waitUntil: 'networkidle' });
    await source.waitForFunction(() => Boolean(window.workbenchFilm));
    await source.evaluate(() => window.workbenchFilm.seek(3.2));
    await source.evaluate(() => document.fonts.ready);
    await source.screenshot({
        path: resolve(output, 'video-thumbnail-3840x2160.jpg'),
        type: 'jpeg',
        quality: 92,
    });
    const art = await browser.newPage({ deviceScaleFactor: 1 });
    art.on('pageerror', error => errors.push(error.message));
    const exportArt = async (name, width, height, html) => {
        await art.setViewportSize({ width, height });
        await art.setContent(html, { waitUntil: 'load' });
        await art.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(image => image.decode()));
        });
        const overflow = await art.evaluate(() => ({
            x: document.documentElement.scrollWidth > innerWidth,
            y: document.documentElement.scrollHeight > innerHeight,
        }));
        assert.deepEqual(overflow, { x: false, y: false }, `Canvas overflow: ${name}`);
        const png = await art.screenshot({ omitBackground: false });
        const info = pngInfo(png);
        assert.deepEqual(
            [info.width, info.height, info.bitDepth, info.colorType],
            [width, height, 8, 2],
            `${name} must be exact-size 24-bit RGB without alpha`
        );
        await writeFile(resolve(output, name), png);
        assets.push({ name, ...info, data: asData(png) });
        console.log(`Exported ${name} · ${width}×${height} · RGB PNG`);
    };
    for (const [index, scene] of SCREENSHOTS.entries()) {
        await exportArt(
            `screenshots/0${index + 1}-${scene.id}-1280x800.png`,
            1280,
            800,
            screenshotHtml(scene, index, images[scene.id], icon, css)
        );
    }
    await exportArt(
        'promotional/small-promo-440x280.png',
        440,
        280,
        promoHtml('small', images, icon, css)
    );
    await exportArt(
        'promotional/marquee-1400x560.png',
        1400,
        560,
        promoHtml('marquee', images, icon, css)
    );
    const iconName = 'icon/store-icon-128x128.png';
    await copyFile(iconSource, resolve(output, iconName));
    const iconPng = await readFile(iconSource);
    assert.deepEqual([pngInfo(iconPng).width, pngInfo(iconPng).height], [128, 128]);
    assets.push({ name: iconName, ...pngInfo(iconPng), data: icon });
    await art.setViewportSize({ width: 1400, height: 2000 });
    const review = reviewHtml(assets, css);
    await writeFile(resolve(output, 'preview.html'), review);
    await art.setContent(review, { waitUntil: 'load' });
    await art.evaluate(() => Promise.all([...document.images].map(image => image.decode())));
    await art.locator('.review').screenshot({ path: resolve(output, 'contact-sheet.png') });
    assert.deepEqual(errors, [], 'Browser runtime errors');
    assert.deepEqual(failedAssets, [], 'Failed local assets');
    await writeFile(
        resolve(output, 'manifest.json'),
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                locale: 'en',
                provenance:
                    'Scripted app UI replicas from the shared product tour, with fictional sample data. Cloud icon updated to say Workbench.',
                requirements: 'https://developer.chrome.com/docs/webstore/cws-dashboard-listing',
                assets: assets.map(({ data: _data, ...asset }) => asset),
                validation: {
                    browserErrors: errors,
                    failedAssets,
                    exactDimensions: true,
                    opaqueRgbScreenshotsAndPromos: true,
                },
            },
            null,
            2
        ) + '\n'
    );
    await writeFile(
        resolve(output, 'UPLOAD-GUIDE.md'),
        `# Chrome Web Store images\n\nUpload these PNG files individually in the developer dashboard. The ZIP is a convenient download bundle, not an extension package.\n\n| Store field | File / folder | Size |\n| --- | --- | --- |\n| Screenshots (English) | screenshots/01 through 05, in order | 1280 × 800 each |\n| Small promo tile | promotional/small-promo-440x280.png | 440 × 280 |\n| Marquee promo tile (optional) | promotional/marquee-1400x560.png | 1400 × 560 |\n| Store icon | icon/store-icon-128x128.png | 128 × 128 |\n\nAll seven screenshots/promotional images are 24-bit RGB PNGs without transparency. The transparent cloud icon now says Workbench.\n\nScreenshots show the five shared product-demo replicas with sample org data. They are exported at the full app viewport height, rather than cropped from the video. Upload screenshots in numerical order: overlay, SOQL, metadata, editor, browser agent.\n\nThe marquee and small promo tile are global assets. The English screenshot set belongs under the English locale.\n\npreview.html and contact-sheet.png are for reviewing the entire set. source-ui/ contains 2200 × 1150 captures for future design work; these are not store upload sizes.\n\nRequirements checked on ${new Date().toISOString().slice(0, 10)} against [Chrome's listing specifications](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) and [image guidance](https://developer.chrome.com/docs/webstore/best-listing).\n`
    );
    const zip = resolve(output, 'chrome-web-store-upload.zip');
    await rm(zip, { force: true });
    await run('zip', ['-q', '-r', zip, 'screenshots', 'promotional', 'icon', 'UPLOAD-GUIDE.md'], {
        cwd: output,
    });
    console.log(`Ready: ${output}`);
} finally {
    await browser?.close();
    await server?.close();
}
