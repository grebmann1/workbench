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

const { execFileSync } = require('child_process');
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

const ALLOWED_TOP_LEVEL = new Set([
    ...REQUIRED_FIELDS,
    'menuIcon',
    'reducerKey',
    'settingsComponent',
]);
const ALLOWED_FLAGS = new Set([...REQUIRED_FLAGS, 'isChromeOnly']);

// Matches the `<id>/<moduleName>` shape for `settingsComponent`. Same family
// as NAME_PATTERN but the suffix isn't fixed to `/app`.
const SETTINGS_COMPONENT_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*\/[a-zA-Z][a-zA-Z0-9]*$/;

// `type` drives filtering/grouping in the quick-action surface. A typo
// silently removes the app from those views, so enforce the known set.
const ALLOWED_TYPES = new Set(['developer', 'admin', 'data', 'utility']);

// `menuGroup` picks the section of the left-nav menu. A typo drops the app
// out of the menu entirely with no warning.
const ALLOWED_MENU_GROUPS = new Set(['data', 'code', 'admin', 'deploy', 'utilities']);

// Used for `id` (folder name / Redux key / identifier). Mirrors the LWC
// camelCase convention we use for module specifiers.
const ID_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

// `name` is the LWC module specifier — must be `<id>/app` to resolve.
const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*\/app$/;

// `path` is the URL router key (`?applicationName=<path>`). URL
// normalisation lowercases so uppercase here would silently rewrite.
const PATH_PATTERN = /^[a-z][a-z0-9-]*$/;

// SLDS icon namespace:name. A missing namespace or a typo ("util:foo")
// renders as a broken icon glyph without any build error.
const ICON_PATTERN = /^(standard|utility|custom|action|doctype):[a-z0-9_]+$/;

function validateSettingsComponent(manifest, filePath, errors) {
    if (!('settingsComponent' in manifest)) return;
    if (typeof manifest.settingsComponent !== 'string' || manifest.settingsComponent.length === 0) {
        errors.push('settingsComponent must be a non-empty string module specifier');
        return;
    }
    if (!SETTINGS_COMPONENT_PATTERN.test(manifest.settingsComponent)) {
        errors.push(
            `settingsComponent "${manifest.settingsComponent}" must match ${SETTINGS_COMPONENT_PATTERN}`
        );
        return;
    }
    // Verify the module folder exists so typos fail at build time.
    const [ns, mod] = manifest.settingsComponent.split('/');
    if (ns !== manifest.id || mod !== 'appSettings') {
        errors.push(
            `settingsComponent "${manifest.settingsComponent}" must be owned by this app as "${manifest.id}/appSettings"`
        );
        return;
    }
    const manifestDir = path.dirname(filePath);
    const candidateLocal = path.join(manifestDir, mod);
    if (!fs.existsSync(candidateLocal)) {
        errors.push(
            `settingsComponent "${manifest.settingsComponent}" folder not found at ${path.relative(PROJECT_ROOT, candidateLocal)}`
        );
        return;
    }
    const entryCandidates = [
        path.join(candidateLocal, 'appSettings.ts'),
        path.join(candidateLocal, 'appSettings.js'),
    ];
    if (!entryCandidates.some(candidate => fs.existsSync(candidate))) {
        errors.push(
            `settingsComponent "${manifest.settingsComponent}" must provide appSettings.ts or appSettings.js`
        );
    }
}

/** Return absolute paths of every <dir>/<dir>.manifest.json under application/. */
const SCAN_SKIP = new Set(['applicationRegistry']);

function collectManifestPaths() {
    const results = [];
    const scanRoot = rootDir => {
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
    // `menuOrder` controls position in the side menu. Must be a non-negative
    // integer — floats and negatives produce unstable sort results.
    if (typeof manifest.menuOrder !== 'number') {
        errors.push('menuOrder must be a number');
    } else if (!Number.isInteger(manifest.menuOrder) || manifest.menuOrder < 0) {
        errors.push('menuOrder must be a non-negative integer');
    }

    // Format checks — skip when the field is missing (already reported above)
    // so we surface one clear error per problem.
    if (typeof manifest.id === 'string' && !ID_PATTERN.test(manifest.id)) {
        errors.push(`id "${manifest.id}" must match ${ID_PATTERN} (lowercase start, alphanumeric)`);
    }
    if (typeof manifest.name === 'string' && !NAME_PATTERN.test(manifest.name)) {
        errors.push(`name "${manifest.name}" must match ${NAME_PATTERN} (e.g. "myapp/app")`);
    }
    if (typeof manifest.path === 'string' && !PATH_PATTERN.test(manifest.path)) {
        errors.push(`path "${manifest.path}" must match ${PATH_PATTERN} (URL-safe, lowercase)`);
    }
    if (typeof manifest.type === 'string' && !ALLOWED_TYPES.has(manifest.type)) {
        errors.push(`type "${manifest.type}" must be one of ${[...ALLOWED_TYPES].join(', ')}`);
    }
    if (typeof manifest.menuGroup === 'string' && !ALLOWED_MENU_GROUPS.has(manifest.menuGroup)) {
        errors.push(
            `menuGroup "${manifest.menuGroup}" must be one of ${[...ALLOWED_MENU_GROUPS].join(', ')}`
        );
    }
    // Icons must carry an SLDS namespace; catches the common "util:" typo
    // and bare names that render as a broken glyph at runtime.
    if (
        typeof manifest.quickActionIcon === 'string' &&
        !ICON_PATTERN.test(manifest.quickActionIcon)
    ) {
        errors.push(`quickActionIcon "${manifest.quickActionIcon}" must match ${ICON_PATTERN}`);
    }
    if (
        manifest.menuIcon !== undefined &&
        (typeof manifest.menuIcon !== 'string' || !ICON_PATTERN.test(manifest.menuIcon))
    ) {
        errors.push(`menuIcon "${manifest.menuIcon}" must match ${ICON_PATTERN}`);
    }

    // The folder name is the implicit source of truth — the generator finds
    // the manifest by looking for `<folder>/<folder>.manifest.json`, so a
    // renamed folder with a stale `id` inside would desync the two.
    const dirName = path.basename(path.dirname(filePath));
    if (typeof manifest.id === 'string' && manifest.id !== dirName) {
        errors.push(`id "${manifest.id}" must equal parent folder name "${dirName}"`);
    }

    validateSettingsComponent(manifest, filePath, errors);

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
    const entry = { ...m, ...m.flags };
    delete entry.id;
    delete entry.name;
    delete entry.flags;
    delete entry.reducerKey;
    delete entry.settingsComponent;
    return entry;
}

/** Identifier for a `settingsComponent` module specifier. */
function settingsComponentIdent(name) {
    return `${name.replace(/[^a-zA-Z0-9]+/g, '_')}_settings`;
}

function jsStringLiteral(value) {
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function jsLiteral(value) {
    return typeof value === 'string' ? jsStringLiteral(value) : JSON.stringify(value);
}

function renderGeneratedRegistryFlattened(manifests) {
    const sorted = [...manifests].sort((a, b) => a.name.localeCompare(b.name));
    const appImports = sorted
        .map(m => `import ${identForName(m.name)} from '${m.name}';`)
        .join('\n');
    const settingsImports = sorted
        .filter(m => typeof m.settingsComponent === 'string')
        .map(
            m =>
                `import ${settingsComponentIdent(m.settingsComponent)} from '${m.settingsComponent}';`
        )
        .join('\n');
    const imports = [appImports, settingsImports].filter(Boolean).join('\n');

    const entries = sorted
        .map(m => {
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
                lines.push(`        ${k}: ${jsLiteral(entry[k])},`);
            }
            if (typeof m.settingsComponent === 'string') {
                lines.push(
                    `        settingsComponent: ${settingsComponentIdent(m.settingsComponent)},`
                );
                lines.push(
                    `        settingsComponentName: ${jsStringLiteral(m.settingsComponent)},`
                );
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

function formatGeneratedOutputs() {
    const prettierCli = require.resolve('prettier/bin/prettier.cjs');
    execFileSync(
        process.execPath,
        [prettierCli, '--write', AGGREGATED_MANIFEST, GENERATED_REGISTRY],
        {
            stdio: 'inherit',
        }
    );
}

function generate() {
    const manifestPaths = collectManifestPaths();
    const manifests = manifestPaths.map(p => {
        const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
        validate(raw, p);
        return raw;
    });

    // Detect duplicate ids / names / paths across the set — different Apps
    // must never share a module specifier, a stable id, or a URL path.
    // Two apps with the same path would collide in the ?applicationName=
    // router and one would silently win.
    const seenIds = new Map();
    const seenNames = new Map();
    const seenPaths = new Map();
    for (const m of manifests) {
        if (seenIds.has(m.id)) {
            throw new Error(
                `Duplicate App id "${m.id}" in ${m.name} — also used by ${seenIds.get(m.id)}`
            );
        }
        if (seenNames.has(m.name)) {
            throw new Error(`Duplicate App name "${m.name}"`);
        }
        if (seenPaths.has(m.path)) {
            throw new Error(
                `Duplicate App path "${m.path}" in ${m.name} — also used by ${seenPaths.get(m.path)}`
            );
        }
        seenIds.set(m.id, m.name);
        seenNames.set(m.name, m.id);
        seenPaths.set(m.path, m.name);
    }

    const aggregated = {
        _comment:
            'Auto-generated by tools/scripts/generate_application_manifest.js — do not edit. Run: npm run generate:application-manifest',
        apps: manifests.sort((a, b) => a.name.localeCompare(b.name)),
    };
    fs.writeFileSync(AGGREGATED_MANIFEST, JSON.stringify(aggregated, null, 4) + '\n', 'utf8');

    const registrySource = renderGeneratedRegistryFlattened(manifests);
    fs.writeFileSync(GENERATED_REGISTRY, registrySource, 'utf8');
    formatGeneratedOutputs();

    console.log(
        `Generated ${path.relative(PROJECT_ROOT, AGGREGATED_MANIFEST)} and ` +
            `${path.relative(PROJECT_ROOT, GENERATED_REGISTRY)} with ${manifests.length} app manifests.`
    );
}

if (require.main === module) {
    generate();
}

module.exports = {
    validate,
    flattenedEntryFromManifest,
    identForName,
    settingsComponentIdent,
    renderGeneratedRegistryFlattened,
};
