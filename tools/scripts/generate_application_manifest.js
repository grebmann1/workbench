/**
 * Walks packages/lwc/main/application/NAME/NAME.manifest.json and emits two
 * files the host consumes:
 *
 *   1. application.manifest.json — aggregated manifest (data only)
 *   2. application.registry.generated.ts — hard-coded imports + the
 *      APPLICATION_APP_MAPPING object that today lives in registry.ts
 *
 * We keep the generated TS file because LWC module specifiers must be
 * statically importable for Rollup tree-shaking and LWC alias resolution.
 * Dynamic imports would defeat those guarantees.
 *
 * Usage: node tools/scripts/generate_application_manifest.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const APPLICATION_ROOT = path.join(PROJECT_ROOT, 'packages/lwc/main/application');
// Additional package roots that contribute App manifests (each root is scanned
// like APPLICATION_ROOT — direct child folder name + `<name>.manifest.json`).
// Extensions live outside packages/lwc/main so core can boot without them.
const EXTENSION_ROOTS = [path.join(PROJECT_ROOT, 'packages/lwc/applications')];
const GENERATED_DIR = path.join(APPLICATION_ROOT, 'applicationRegistry');
const AGGREGATED_MANIFEST = path.join(GENERATED_DIR, 'application.manifest.json');
const GENERATED_REGISTRY = path.join(GENERATED_DIR, 'applicationRegistry.ts');

const REQUIRED_FIELDS = [
    'id',
    'name',
    'label',
    'shortName',
    'description',
    'path',
    'quickActionIcon',
    'type',
    'menuGroup',
    'menuOrder',
    'flags',
];

const REQUIRED_FLAGS = [
    'isFullHeight',
    'isDeletable',
    'isElectronOnly',
    'isOfflineAvailable',
    'isMenuVisible',
    'isTabVisible',
];

const ALLOWED_TOP_LEVEL = new Set([...REQUIRED_FIELDS, 'menuIcon', 'reducerKey']);
const ALLOWED_FLAGS = new Set([...REQUIRED_FLAGS, 'isChromeOnly']);

/** Return absolute paths of every <dir>/<dir>.manifest.json under application/. */
const SCAN_SKIP = new Set(['applicationRegistry']);

function collectManifestPaths() {
    const results = [];
    const scanRoot = (rootDir) => {
        if (!fs.existsSync(rootDir)) return;
        for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            if (SCAN_SKIP.has(entry.name)) continue;
            const manifestPath = path.join(rootDir, entry.name, `${entry.name}.manifest.json`);
            if (fs.existsSync(manifestPath)) {
                results.push(manifestPath);
            }
        }
    };
    scanRoot(APPLICATION_ROOT);
    EXTENSION_ROOTS.forEach(scanRoot);
    return results.sort();
}

function validate(manifest, filePath) {
    const errors = [];
    for (const field of REQUIRED_FIELDS) {
        if (manifest[field] === undefined || manifest[field] === null) {
            errors.push(`missing required field "${field}"`);
        }
    }
    for (const key of Object.keys(manifest)) {
        if (!ALLOWED_TOP_LEVEL.has(key)) {
            errors.push(`unknown field "${key}"`);
        }
    }
    if (manifest.flags && typeof manifest.flags === 'object') {
        for (const flag of REQUIRED_FLAGS) {
            if (typeof manifest.flags[flag] !== 'boolean') {
                errors.push(`flags.${flag} must be boolean`);
            }
        }
        for (const key of Object.keys(manifest.flags)) {
            if (!ALLOWED_FLAGS.has(key)) {
                errors.push(`unknown flag "flags.${key}"`);
            }
        }
    }
    if (typeof manifest.menuOrder !== 'number') {
        errors.push('menuOrder must be a number');
    }
    if (errors.length > 0) {
        throw new Error(
            `Invalid manifest at ${path.relative(PROJECT_ROOT, filePath)}:\n  - ${errors.join('\n  - ')}`
        );
    }
}

/**
 * Turn a module specifier like "accessAnalyzer/app" into a valid JS
 * identifier. Must be stable across runs for readable diffs.
 */
function identForName(name) {
    return `${name.replace(/[^a-zA-Z0-9]+/g, '_')}_module`;
}

/**
 * The generated registry embeds flags at the top level (matching the
 * legacy registry.ts shape), not under a `flags` sub-object. That's the
 * shape every existing consumer already reads.
 */
function flattenedEntryFromManifest(m) {
    // Match the legacy registry.ts shape exactly: the `name` key is used
    // as the map key, not as a field of the value (see
    // core/applications/applications.ts which reconstructs it via
    // Object.keys(APP_MAPPING)).
    const { id: _id, name: _name, flags, reducerKey: _rk, ...rest } = m;
    return { ...rest, ...flags };
}

function renderGeneratedRegistryFlattened(manifests) {
    const sorted = [...manifests].sort((a, b) => a.name.localeCompare(b.name));
    const imports = sorted
        .map((m) => `import ${identForName(m.name)} from '${m.name}';`)
        .join('\n');

    const entries = sorted
        .map((m) => {
            const entry = flattenedEntryFromManifest(m);
            // Emit keys in a deterministic order matching the original
            // registry.ts for byte-level diff parity.
            const keyOrder = [
                'isFullHeight',
                'isDeletable',
                'isElectronOnly',
                'isOfflineAvailable',
                'isChromeOnly',
                'isMenuVisible',
                'isTabVisible',
                'label',
                'type',
                'description',
                'quickActionIcon',
                'menuIcon',
                'shortName',
                'path',
                'menuGroup',
                'menuOrder',
            ];
            const lines = [];
            lines.push(`        module: ${identForName(m.name)},`);
            for (const k of keyOrder) {
                if (entry[k] === undefined) continue;
                lines.push(`        ${k}: ${JSON.stringify(entry[k])},`);
            }
            return `    '${m.name}': {\n${lines.join('\n')}\n    },`;
        })
        .join('\n');

    return (
        `// Auto-generated by tools/scripts/generate_application_manifest.js — do not edit.\n` +
        `// Run: npm run generate:application-manifest\n\n` +
        `${imports}\n\n` +
        `const APPLICATION_APP_MAPPING = {\n` +
        `${entries}\n` +
        `};\n\n` +
        `export { APPLICATION_APP_MAPPING };\n`
    );
}

function generate() {
    const manifestPaths = collectManifestPaths();
    const manifests = manifestPaths.map((p) => {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        validate(raw, p);
        return raw;
    });

    // Detect duplicate ids / names across the set — different Apps must
    // never share a module specifier or a stable id.
    const seenIds = new Map();
    const seenNames = new Map();
    for (const m of manifests) {
        if (seenIds.has(m.id)) {
            throw new Error(
                `Duplicate App id "${m.id}" in ${m.name} — also used by ${seenIds.get(m.id)}`
            );
        }
        if (seenNames.has(m.name)) {
            throw new Error(`Duplicate App name "${m.name}"`);
        }
        seenIds.set(m.id, m.name);
        seenNames.set(m.name, m.id);
    }

    const aggregated = {
        _comment:
            'Auto-generated by tools/scripts/generate_application_manifest.js — do not edit. Run: npm run generate:application-manifest',
        apps: manifests.sort((a, b) => a.name.localeCompare(b.name)),
    };
    fs.writeFileSync(AGGREGATED_MANIFEST, JSON.stringify(aggregated, null, 2) + '\n', 'utf8');

    const registrySource = renderGeneratedRegistryFlattened(manifests);
    fs.writeFileSync(GENERATED_REGISTRY, registrySource, 'utf8');

    console.log(
        `Generated ${path.relative(PROJECT_ROOT, AGGREGATED_MANIFEST)} and ` +
            `${path.relative(PROJECT_ROOT, GENERATED_REGISTRY)} with ${manifests.length} app manifests.`
    );
}

generate();
