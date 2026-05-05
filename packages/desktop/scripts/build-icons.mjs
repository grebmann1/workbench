import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, '..');
const iconsRoot = path.join(desktopRoot, 'resources', 'icons');
const sourcePng = path.join(iconsRoot, 'icon.png');
const iconsetPath = path.join(iconsRoot, 'icon.iconset');
const icnsPath = path.join(iconsRoot, 'icon.icns');

if (process.platform !== 'darwin') {
    if (!fs.existsSync(sourcePng)) {
        throw new Error(`Missing source icon: ${sourcePng}`);
    }

    console.log('Skipping macOS .icns generation on non-macOS host.');
    process.exit(0);
}

const iconSizes = [
    [16, 'icon_16x16.png'],
    [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'],
    [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'],
    [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'],
    [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'],
    [1024, 'icon_512x512@2x.png'],
];

if (!fs.existsSync(sourcePng)) {
    throw new Error(`Missing source icon: ${sourcePng}`);
}

fs.rmSync(iconsetPath, { force: true, recursive: true });
fs.mkdirSync(iconsetPath, { recursive: true });

for (const [size, fileName] of iconSizes) {
    execFileSync(
        'sips',
        ['-z', String(size), String(size), sourcePng, '--out', path.join(iconsetPath, fileName)],
        {
            stdio: 'inherit',
        }
    );
}

execFileSync('iconutil', ['-c', 'icns', iconsetPath, '-o', icnsPath], { stdio: 'inherit' });
fs.rmSync(iconsetPath, { force: true, recursive: true });

console.log(`Generated ${icnsPath}`);
