import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const source = await readFile(new URL('./icon.svg', import.meta.url));
const destination = new URL('../../../assets/extension/images/', import.meta.url);
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    const icons = await page.evaluate(async svg => {
        const image = new Image();
        image.src = `data:image/svg+xml;base64,${svg}`;
        await image.decode();
        return [16, 32, 48, 128].map(size => {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = size;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0, size, size);
            return { size, png: canvas.toDataURL('image/png').split(',')[1] };
        });
    }, source.toString('base64'));
    for (const { size, png } of icons) {
        await writeFile(
            new URL(`sf-toolkit-chat-icon-${size}.png`, destination),
            Buffer.from(png, 'base64')
        );
    }
    // Keep the existing development asset path on the same branding.
    await copyFile(
        new URL('sf-toolkit-chat-icon-128.png', destination),
        new URL('sf-toolkit-chat-icon-128-dev.png', destination)
    );
} finally {
    await browser.close();
}
