#!/usr/bin/env node

/**
 * Copy the patched jsforce webpack bundle into the Chrome alias path.
 * Rollup resolves `imported/jsforce` to assets/extension/libs/jsforce/jsforce.js.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const source =
    process.env.JSFORCE_MIN_JS || path.join(repoRoot, 'node_modules/jsforce/dist/jsforce.min.js');
const destDir = path.join(repoRoot, 'assets/extension/libs/jsforce');
const dest = path.join(destDir, 'jsforce.js');

const raw = await readFile(source, 'utf8');
const withoutMap = raw.replace(/\n?\/\/# sourceMappingURL=.*$/m, '');
const wrapped = `${withoutMap.trimEnd()}\nexport default jsforce;\n`;

await mkdir(destDir, { recursive: true });
await writeFile(dest, wrapped);
console.log(`Wrote ${path.relative(repoRoot, dest)} from ${path.relative(repoRoot, source)}`);
