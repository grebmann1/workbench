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
const CACHE_MANAGER_PATH = path.join(
    PROJECT_ROOT,
    'packages/lwc/shared/modules/cacheManager/cacheManager.ts'
);
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
    'settings',
    'settingsComponent',
]);
const ALLOWED_FLAGS = new Set([...REQUIRED_FLAGS, 'isChromeOnly']);

// User-facing setting types rendered by the generic <settings-app-section>.
// Keep aligned with the switch inside appSection.html.
const SETTING_TYPES = new Set(['toggle', 'text', 'password', 'number', 'select', 'multiselect']);
const ALLOWED_SETTING_KEYS = new Set([
    'key',
    'label',
    'description',
    'type',
    'defaultValue',
    'options',
]);

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

/**
 * Parse `CACHE_CONFIG` cache keys from cacheManager.ts so manifests can be
 * cross-checked. A manifest setting referencing a non-existent cache key is
 * a build-time failure — silent rename drift would otherwise leave the UI
 * toggling a phantom key.
 */
function loadCacheConfigKeys() {
    if (!fs.existsSync(CACHE_MANAGER_PATH)) {
        throw new Error(`cacheManager.ts not found at ${CACHE_MANAGER_PATH}`);
    }
    const source = fs.readFileSync(CACHE_MANAGER_PATH, 'utf8');
    const keys = new Set();
    const re = /new\s+CONFIG_OBJECT\s*(?:<[^>]*>)?\s*\(\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(source)) !== null) {
        keys.add(m[1]);
    }
    return keys;
}

const CACHE_KEYS = loadCacheConfigKeys();

function validateSettings(manifest, filePath, errors) {
    const hasSettings = Array.isArray(manifest.settings) && manifest.settings.length > 0;
    const hasComponent =
        typeof manifest.settingsComponent === 'string' && manifest.settingsComponent.length > 0;

    if ('settings' in manifest && !Array.isArray(manifest.settings)) {
        errors.push('settings must be an array');
    }
    if ('settingsComponent' in manifest && typeof manifest.settingsComponent !== 'string') {
        errors.push('settingsComponent must be a string module specifier');
    }
    if (hasSettings && hasComponent) {
        errors.push('settings and settingsComponent are mutually exclusive — choose one');
    }

    if (Array.isArray(manifest.settings)) {
        manifest.settings.forEach((entry, i) => {
            if (!entry || typeof entry !== 'object') {
                errors.push(`settings[${i}] must be an object`);
                return;
            }
            for (const k of Object.keys(entry)) {
                if (!ALLOWED_SETTING_KEYS.has(k)) {
                    errors.push(`settings[${i}]: unknown field "${k}"`);
                }
            }
            if (typeof entry.key !== 'string' || entry.key.length === 0) {
                errors.push(`settings[${i}].key must be a non-empty string`);
            } else if (!CACHE_KEYS.has(entry.key)) {
                errors.push(
                    `settings[${i}].key "${entry.key}" is not a known CACHE_CONFIG key — add it to cacheManager.ts first`
                );
            }
            if (typeof entry.label !== 'string' || entry.label.length === 0) {
                errors.push(`settings[${i}].label must be a non-empty string`);
            }
            if (entry.description !== undefined && typeof entry.description !== 'string') {
                errors.push(`settings[${i}].description must be a string`);
            }
            if (!SETTING_TYPES.has(entry.type)) {
                errors.push(
                    `settings[${i}].type "${entry.type}" must be one of ${[...SETTING_TYPES].join(', ')}`
                );
            } else {
                switch (entry.type) {
                    case 'toggle':
                        if (typeof entry.defaultValue !== 'boolean') {
                            errors.push(`settings[${i}].defaultValue must be boolean for toggle`);
                        }
                        break;
                    case 'text':
                    case 'password':
                        if (
                            entry.defaultValue !== undefined &&
                            typeof entry.defaultValue !== 'string' &&
                            entry.defaultValue !== null
                        ) {
                            errors.push(
                                `settings[${i}].defaultValue must be string|null for ${entry.type}`
                            );
                        }
                        break;
                    case 'number':
                        if (
                            entry.defaultValue !== undefined &&
                            typeof entry.defaultValue !== 'number'
                        ) {
                            errors.push(`settings[${i}].defaultValue must be number`);
                        }
                        break;
                    case 'select':
                        if (
                            entry.defaultValue !== undefined &&
                            typeof entry.defaultValue !== 'string'
                        ) {
                            errors.push(`settings[${i}].defaultValue must be string for select`);
                        }
                        if (!Array.isArray(entry.options) && typeof entry.options !== 'string') {
                            errors.push(
                                `settings[${i}].options must be an array or provider id string`
                            );
                        }
                        break;
                    case 'multiselect':
                        if (
                            entry.defaultValue !== undefined &&
                            !Array.isArray(entry.defaultValue)
                        ) {
                            errors.push(
                                `settings[${i}].defaultValue must be an array for multiselect`
                            );
                        }
                        if (!Array.isArray(entry.options) && typeof entry.options !== 'string') {
                            errors.push(
                                `settings[${i}].options must be an array or provider id string`
                            );
                        }
                        break;
                }
            }
        });
    }

    if (hasComponent) {
        if (!SETTINGS_COMPONENT_PATTERN.test(manifest.settingsComponent)) {
            errors.push(
                `settingsComponent "${manifest.settingsComponent}" must match ${SETTINGS_COMPONENT_PATTERN}`
            );
        } else {
            // Verify the module folder exists so typos fail at build time.
            const [ns, mod] = manifest.settingsComponent.split('/');
            const manifestDir = path.dirname(filePath);
            const candidateLocal = path.join(manifestDir, mod);
            const rootDir = path.dirname(manifestDir);
            const candidateSibling = path.join(rootDir, ns, mod);
            if (!fs.existsSync(candidateLocal) && !fs.existsSync(candidateSibling)) {
                errors.push(
                    `settingsComponent "${manifest.settingsComponent}" folder not found (looked in ${path.relative(PROJECT_ROOT, candidateLocal)} and ${path.relative(PROJECT_ROOT, candidateSibling)})`
                );
            }
        }
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

    validateSettings(manifest, filePath, errors);

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
    const {
        id: _id,
        name: _name,
        flags,
        reducerKey: _rk,
        settings: _s,
        settingsComponent: _sc,
        ...rest
    } = m;
    return { ...rest, ...flags };
}

/** Identifier for a `settingsComponent` module specifier. */
function settingsComponentIdent(name) {
    return `${name.replace(/[^a-zA-Z0-9]+/g, '_')}_settings`;
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
                lines.push(`        ${k}: ${JSON.stringify(entry[k])},`);
            }
            if (Array.isArray(m.settings) && m.settings.length > 0) {
                lines.push(`        settings: ${JSON.stringify(m.settings)},`);
            }
            if (typeof m.settingsComponent === 'string') {
                lines.push(
                    `        settingsComponent: ${settingsComponentIdent(m.settingsComponent)},`
                );
                lines.push(
                    `        settingsComponentName: ${JSON.stringify(m.settingsComponent)},`
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
    fs.writeFileSync(AGGREGATED_MANIFEST, JSON.stringify(aggregated, null, 2) + '\n', 'utf8');

    const registrySource = renderGeneratedRegistryFlattened(manifests);
    fs.writeFileSync(GENERATED_REGISTRY, registrySource, 'utf8');

    console.log(
        `Generated ${path.relative(PROJECT_ROOT, AGGREGATED_MANIFEST)} and ` +
            `${path.relative(PROJECT_ROOT, GENERATED_REGISTRY)} with ${manifests.length} app manifests.`
    );
}

generate();
