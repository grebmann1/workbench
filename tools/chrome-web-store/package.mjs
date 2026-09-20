import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = Object.fromEntries(
    process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('='))
);
const images = resolve(root, options.images ?? 'out/chrome-web-store-salesforce-blue');
const film = resolve(root, options.video ?? 'out/product-film-salesforce-blue');
const output = resolve(root, options.out ?? 'out/workbench-2.0-store-kit');
const imageManifest = JSON.parse(await readFile(resolve(images, 'manifest.json'), 'utf8'));
assert.equal(imageManifest.assets.length, 8);
const files = [];
const hashes = [];
const textFile = async (name, content) => {
    await mkdir(dirname(resolve(output, name)), { recursive: true });
    await writeFile(resolve(output, name), content);
    files.push(name);
};
const copy = async (source, name) => {
    await mkdir(dirname(resolve(output, name)), { recursive: true });
    await copyFile(source, resolve(output, name));
    const original = await readFile(source);
    const copied = await readFile(resolve(output, name));
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(original), hash(copied));
    hashes.push({ file: name, bytes: copied.length, sha256: hash(copied) });
    files.push(name);
};
for (const asset of imageManifest.assets) {
    assert.match(asset.name, /^(screenshots|promotional|icon)\/[\w-]+\.png$/);
    const png = await readFile(resolve(images, asset.name));
    assert.equal(png.readUInt32BE(16), asset.width);
    assert.equal(png.readUInt32BE(20), asset.height);
    await copy(resolve(images, asset.name), `store-images/${asset.name}`);
}
await copy(resolve(film, 'workbench-tour.mp4'), 'video/workbench-2.0-tour.mp4');
await copy(resolve(film, 'workbench-tour.srt'), 'video/english-captions.srt');
await copy(
    resolve(images, 'video-thumbnail-3840x2160.jpg'),
    'video/youtube-thumbnail-3840x2160.jpg'
);
await copy(resolve(images, 'contact-sheet.png'), 'preview-images.png');
await copy(resolve(images, 'preview.html'), 'preview-images.html');
await copy(
    resolve(root, 'apps/ui/src/product-tour/assets/workbench-logo-500.png'),
    'branding/workbench-logo-500.png'
);
assert.ok((await stat(resolve(output, 'video/youtube-thumbnail-3840x2160.jpg'))).size < 2_000_000);
const probe = JSON.parse(
    (
        await run('ffprobe', [
            '-v',
            'error',
            '-show_streams',
            '-show_format',
            '-of',
            'json',
            resolve(output, 'video/workbench-2.0-tour.mp4'),
        ])
    ).stdout
);
const video = probe.streams.find(s => s.codec_type === 'video');
assert.deepEqual([video.width, video.height, video.r_frame_rate], [1920, 1080, '30/1']);
assert.equal(Number(probe.format.duration), 78);
const thumbnail = JSON.parse(
    (
        await run('ffprobe', [
            '-v',
            'error',
            '-show_streams',
            '-of',
            'json',
            resolve(output, 'video/youtube-thumbnail-3840x2160.jpg'),
        ])
    ).stdout
).streams[0];
assert.deepEqual([thumbnail.width, thumbnail.height], [3840, 2160]);
const captions = await readFile(resolve(output, 'video/english-captions.srt'), 'utf8');
assert.ok(captions.includes('These are just a few of Workbench 2.0’s capabilities.'));

const title = 'Workbench 2.0 — A few of the possibilities | Salesforce toolkit';
const description = `Discover a few of Workbench 2.0’s capabilities in this 78-second tour.

• Find Salesforce objects and open org tools from the overlay.
• Write SOQL queries and inspect the results.
• Browse metadata and explore component structure.
• Create Lightning Web Components in the browser editor.
• Follow an AI browser agent as it completes a support form.

These are just a few of the things you can do with Workbench 2.0.

Explore Workbench: https://sf-workbench.com
Get the Chrome extension: https://chromewebstore.google.com/detail/salesforce-toolkit/konbmllgicfccombdckckakhnmejjoei

Illustrative demo with fictional sample org data. Includes an original instrumental soundtrack and on-screen explanations.
`;
assert.ok(title.length <= 100);
assert.ok(description.length <= 5000);
await textFile('video/youtube-title.txt', title + '\n');
await textFile('video/youtube-description.txt', description);

const rows = [
    ['English screenshots', 'store-images/screenshots/01…05-1280x800.png', '1280 × 800 each'],
    ['Small promo tile', 'store-images/promotional/small-promo-440x280.png', '440 × 280'],
    ['Marquee tile (optional)', 'store-images/promotional/marquee-1400x560.png', '1400 × 560'],
    ['Store icon', 'store-images/icon/store-icon-128x128.png', '128 × 128'],
    ['Promotional video', 'Paste the YouTube URL after uploading the MP4', '78 seconds · 1080p'],
];
const sources = {
    listing: 'https://developer.chrome.com/docs/webstore/cws-dashboard-listing',
    update: 'https://developer.chrome.com/docs/webstore/update',
    upload: 'https://support.google.com/youtube/answer/57407?hl=en',
    privacy: 'https://support.google.com/youtube/answer/157177?hl=en',
    embedding: 'https://support.google.com/youtube/answer/171780?hl=en',
    captions: 'https://support.google.com/youtube/answer/2734796?hl=en',
    thumbnail: 'https://support.google.com/youtube/answer/72431?hl=en',
};
const guide = `# Workbench 2.0 — Store listing kit

This kit contains the Salesforce blue video and matching images. Extract the ZIP before uploading. The kit ZIP is a media handoff, not an extension package: use the Store listing tab rather than Upload New Package.

## 1. Put the video on YouTube

Chrome Web Store uses a YouTube link for promotional video. It does not accept the MP4 in that field. [Chrome listing documentation](${sources.listing}).

1. Open [YouTube Studio](https://studio.youtube.com), choose Create → Upload videos, and select video/workbench-2.0-tour.mp4.
2. Paste video/youtube-title.txt into the title and video/youtube-description.txt into the description.
3. Add video/youtube-thumbnail-3840x2160.jpg as the custom thumbnail if your channel has that feature enabled. It is 16:9 and under 2 MB. Set the language to English and complete the audience/settings questions for this developer-tool demo. [Upload help](${sources.upload}) · [Thumbnail help](${sources.thumbnail}).
4. Keep Allow embedding enabled under the additional video settings. Set visibility to Unlisted (recommended for a store demo) or Public. Unlisted is viewable by anyone with the URL; Private would restrict viewers. Save the video and wait for 1080p processing. [Visibility](${sources.privacy}) · [Embedding](${sources.embedding}).
5. Add English subtitles by uploading video/english-captions.srt with timing, then save/publish that caption track. These are timed explanations for a music-backed demo; no automatic speech transcription is needed. [Caption upload help](${sources.captions}).
6. Copy the video's share URL. You can verify it in a signed-out/private browser window before using it in the listing.

## 2. Add the store images and video URL

Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole), select the existing extension, then open Store listing. Choose English for these screenshots and the video.

| Dashboard field | File or value | Size |
| --- | --- | --- |
${rows.map(row => `| ${row.join(' | ')} |`).join('\n')}

Replace the earlier screenshots and arrange these five in numerical order: overlay, SOQL, metadata, editor, browser agent. Use the YouTube share URL in the promotional video field (or Localized promo video for English). Promo tiles are global assets. [Field and localization guidance](${sources.listing}).

## 3. Save and submit

Save the listing, review the images and video link, then choose Submit for Review and confirm the publishing timing offered by the dashboard. If automatic publication is disabled, publish manually after approval. [Chrome update instructions](${sources.update}).

The cloud icon now says Workbench. Use store-images/icon/store-icon-128x128.png for the store icon; branding/workbench-logo-500.png is a larger transparent copy for future artwork. Updating these listing media fields does not itself require uploading the kit as an extension build. A real code or manifest update would use your separately built extension package.

## What is included

- Eight store PNGs, already at the required dimensions. Screenshots/promos are opaque RGB; the icon retains its transparency.
- A 1920×1080, 30fps, 78-second MP4 with music and optional English subtitle track.
- Separate timed English captions, a 3840×2160 YouTube thumbnail, and copyable title/description.
- preview-images.html / preview-images.png to review the image set.
- ASSET-MANIFEST.json with file hashes and checked dimensions.

Screens use the shared app-demo replicas and fictional org data. Nothing has been uploaded or published by the preparation scripts. Specifications checked ${new Date().toISOString().slice(0, 10)}.
`;
await textFile('START-HERE.md', guide);
const escapeHtml = value =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Workbench 2.0 · Store upload guide</title><style>
*{box-sizing:border-box}body{margin:0;background:#edf5fe;color:#032d60;font:16px/1.6 system-ui,sans-serif}main{max-width:1080px;margin:36px auto;padding:40px;background:white;border-radius:18px}h1{margin:0;font-size:34px}h2{margin-top:32px}a{color:#0176d3}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:12px;border-bottom:1px solid #d7e8f7;text-align:left}td:nth-child(2){overflow-wrap:anywhere}textarea{width:100%;padding:14px;font:14px/1.5 system-ui;border:1px solid #bed6ea;border-radius:8px;color:#032d60;background:#f5faff}li{margin:10px 0}.notice{padding:14px 18px;background:#eaf5fe;border-left:4px solid #0176d3}.preview{width:100%;max-height:420px;object-fit:contain;background:#032d60}.links{display:flex;gap:22px;flex-wrap:wrap}@media(max-width:700px){main{margin:0;padding:22px;border-radius:0}table{font-size:12px}}
</style><main><h1>Workbench 2.0 · Ready for the store</h1><p>The Salesforce blue video and matching images are prepared.</p>
<p class="notice">Upload the MP4 to YouTube first, then paste its URL into Chrome Web Store. Upload the PNG images individually after extracting this kit.</p>
<p class="links"><a href="preview-images.html">Preview all images</a><a href="video/workbench-2.0-tour.mp4">Watch the video</a><a href="START-HERE.md">Detailed instructions and sources</a></p>
<h2>1. Upload the video to YouTube</h2><ol><li>Open <a href="https://studio.youtube.com">YouTube Studio</a> → Create → Upload videos. Select <b>video/workbench-2.0-tour.mp4</b>.</li><li>Copy the title and description below. Add <b>video/youtube-thumbnail-3840x2160.jpg</b> as the thumbnail if available.</li><li>Select <b>Unlisted</b> (or Public), keep <b>Allow embedding</b> enabled, and save. Wait for HD processing.</li><li>Add <b>video/english-captions.srt</b> as English subtitles, choosing <b>With timing</b>. Copy the video's share URL.</li></ol>
<label for="title"><b>Video title</b></label><textarea id="title" rows="2" readonly>${escapeHtml(title)}</textarea><label for="description"><b>Video description</b></label><textarea id="description" rows="12" readonly>${escapeHtml(description)}</textarea>
<h2>2. Fill in the store listing</h2><p>Open the <a href="https://chrome.google.com/webstore/devconsole">Developer Dashboard</a>, select your existing extension, and open <b>Store listing</b>. Choose English for screenshots and the video.</p><table><thead><tr><th>Field</th><th>File / value</th><th>Size</th></tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table><p>Order the five screenshots 01–05. The small promo and marquee are global images. Paste the YouTube URL in the promotional video field.</p>
<h2>3. Save and submit</h2><p>Save your changes, review the listing, then select <b>Submit for Review</b>. Confirm whether to publish automatically after approval or manually later.</p><p>This media ZIP belongs in your design files; use the individual images in Store listing, not Upload New Package.</p>
<p><a href="${sources.listing}">Chrome listing requirements</a> · <a href="${sources.update}">Submitting listing updates</a> · <a href="${sources.upload}">YouTube upload help</a></p><p>Nothing has been uploaded or published. The detailed guide covers caption and visibility settings.</p></main></html>`;
await textFile('START-HERE.html', html);
await textFile(
    'ASSET-MANIFEST.json',
    JSON.stringify(
        {
            preparedAt: new Date().toISOString(),
            locale: 'en',
            brand: 'Workbench 2.0',
            theme: 'Salesforce blue',
            video: {
                width: video.width,
                height: video.height,
                fps: video.r_frame_rate,
                duration: Number(probe.format.duration),
                bytes: Number(probe.format.size),
            },
            thumbnail: { width: thumbnail.width, height: thumbnail.height },
            storeImages: imageManifest.assets,
            sha256: hashes,
            status: 'Prepared locally; no external upload or publication performed.',
        },
        null,
        2
    ) + '\n'
);
const zip = `${output}.zip`;
await rm(zip, { force: true });
await run('zip', ['-q', zip, ...files.map(name => `${basename(output)}/${name}`)], {
    cwd: dirname(output),
});
console.log(`Prepared ${files.length} files: ${output}\nZIP: ${zip}`);
