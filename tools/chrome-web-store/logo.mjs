import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Preserve the existing cloud silhouette while replacing the lettering completely.
const source = await readFile(
    new URL('../../packages/extension/src/images/sf-toolkit-icon-500.png', import.meta.url)
);
const destination = new URL('../../apps/ui/src/product-tour/assets/', import.meta.url);
await mkdir(destination, { recursive: true });
const browser = await chromium.launch();
try {
    const page = await browser.newPage();
    const icons = await page.evaluate(
        async data => {
            const image = new Image();
            image.src = data;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 500;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            context.globalCompositeOperation = 'source-in';
            context.fillStyle = '#00a1e1';
            context.fillRect(0, 0, 500, 500);
            context.globalCompositeOperation = 'source-over';
            context.font = '700 64px Arial, sans-serif';
            context.textAlign = 'center';
            context.fillStyle = '#ffffff';
            const metrics = context.measureText('Workbench');
            const baseline =
                250 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
            context.fillText('Workbench', 250, baseline);
            return [500, 128].map(size => {
                const output = document.createElement('canvas');
                output.width = output.height = size;
                const outputContext = output.getContext('2d');
                outputContext.imageSmoothingQuality = 'high';
                outputContext.drawImage(canvas, 0, 0, size, size);
                return { size, png: output.toDataURL('image/png').split(',')[1] };
            });
        },
        `data:image/png;base64,${source.toString('base64')}`
    );
    for (const { size, png } of icons) {
        await writeFile(
            new URL(`workbench-logo-${size}.png`, destination),
            Buffer.from(png, 'base64')
        );
        console.log(`Generated Workbench cloud logo · ${size}×${size}`);
    }
} finally {
    await browser.close();
}
