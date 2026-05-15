import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const ROOT = '/Users/grebmann/Documents/personnal/projects/code/sf-toolkit-web';
const EXT_DIR = path.join(ROOT, 'dist/extension');

function deriveExtensionId(manifestKeyB64) {
    const pub = Buffer.from(manifestKeyB64, 'base64');
    const hash = crypto.createHash('sha256').update(pub).digest('hex');
    return hash.slice(0, 32).split('').map(c => String.fromCharCode(parseInt(c, 16) + 'a'.charCodeAt(0))).join('');
}

const manifest = JSON.parse(fs.readFileSync(path.join(EXT_DIR, 'manifest.json'), 'utf8'));
const id = deriveExtensionId(manifest.key);
console.log('Extension dir:', EXT_DIR);
console.log('Manifest key length:', manifest.key.length);
console.log('Derived extension id:', id);

const ctx = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
        `--disable-extensions-except=${EXT_DIR}`,
        `--load-extension=${EXT_DIR}`,
        '--no-first-run',
        '--no-default-browser-check',
    ],
});

// 1. Check if Chrome registered the extension at all
console.log('Service workers at start:', ctx.serviceWorkers().map(sw => sw.url()));

// 2. Open chrome://extensions to see what Chrome thinks
const inspectPage = await ctx.newPage();
await inspectPage.goto('chrome://extensions');
await new Promise(r => setTimeout(r, 1500));

// 3. Try the actual URL the test uses
const appPage = await ctx.newPage();
const appUrl = `chrome-extension://${id}/views/app.html?applicationName=urlencoder`;
console.log('Navigating to:', appUrl);
const resp = await appPage.goto(appUrl, { waitUntil: 'domcontentloaded' }).catch(e => ({ error: e.message }));
console.log('Response status:', resp?.status?.());
console.log('Response error:', resp?.error);
console.log('Page url after goto:', appPage.url());
console.log('Page title:', await appPage.title());

// 4. Take a screenshot
const shotPath = '/tmp/probe-shot.png';
await appPage.screenshot({ path: shotPath, fullPage: true });
console.log('Screenshot saved to:', shotPath);

// 5. Dump body text (truncated)
const bodyText = await appPage.evaluate(() => document.body.innerText.slice(0, 500));
console.log('Body text (first 500 chars):', JSON.stringify(bodyText));

console.log('Service workers after open:', ctx.serviceWorkers().map(sw => sw.url()));

await ctx.close();
