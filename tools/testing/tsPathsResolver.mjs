import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, extname, isAbsolute, resolve as resolvePath } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const TSCONFIGS = [
    { path: resolvePath(REPO_ROOT, 'packages/lwc/shared/tsconfig.json') },
    { path: resolvePath(REPO_ROOT, 'packages/lwc/main/tsconfig.json') },
];

const KNOWN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']);
const PROBE_EXTS = ['', '.ts', '.js', '.mjs', '/index.ts', '/index.js'];

let DISABLED = false;
const aliasTable = loadAliasTable();

function loadTsconfig(configPath) {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const compiler = parsed.compilerOptions ?? {};
    const baseUrlRel = compiler.baseUrl ?? '.';
    const baseUrl = resolvePath(dirname(configPath), baseUrlRel);
    const paths = compiler.paths ?? {};
    return { baseUrl, paths };
}

function loadAliasTable() {
    try {
        const entries = [];
        for (const cfg of TSCONFIGS) {
            const { baseUrl, paths } = loadTsconfig(cfg.path);
            for (const [key, targets] of Object.entries(paths)) {
                if (!Array.isArray(targets) || targets.length === 0) continue;
                const target = targets[0];
                const targetAbs = resolvePath(
                    baseUrl,
                    target.replace(/\*$/, '').replace(/\/$/, '')
                );
                const isWildcard = key.endsWith('/*');
                const prefix = isWildcard ? key.slice(0, -2) : key;
                entries.push({ key, prefix, isWildcard, target: targetAbs });
            }
        }
        // Exact before wildcard, longer prefix first; stable on ties.
        entries.sort((a, b) => {
            if (a.isWildcard !== b.isWildcard) return a.isWildcard ? 1 : -1;
            return b.prefix.length - a.prefix.length;
        });
        return entries;
    } catch (err) {
        process.stderr.write(`[tsPathsResolver] disabled: ${err.message}\n`);
        DISABLED = true;
        return [];
    }
}

function isFile(path) {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

function probeOnDisk(candidate) {
    const name = basename(candidate);
    // LWR convention: `agent/utils` -> `agent/utils/utils.ts` (folder + same-named file).
    const probes = [...PROBE_EXTS, `/${name}.ts`, `/${name}.js`];
    for (const ext of probes) {
        const probe = candidate + ext;
        if (isFile(probe)) {
            try {
                return realpathSync(probe);
            } catch {
                return probe;
            }
        }
    }
    return null;
}

function resolveAlias(specifier) {
    for (const entry of aliasTable) {
        if (!entry.isWildcard) {
            if (specifier === entry.key) {
                const hit = probeOnDisk(entry.target);
                if (hit) return hit;
            }
            continue;
        }
        if (specifier === entry.prefix || specifier.startsWith(entry.prefix + '/')) {
            const tail = specifier === entry.prefix ? '' : specifier.slice(entry.prefix.length + 1);
            const candidate = tail ? resolvePath(entry.target, tail) : entry.target;
            const hit = probeOnDisk(candidate);
            if (hit) return hit;
        }
    }
    return null;
}

function resolveRelativeExtensionless(specifier, parentURL) {
    if (!parentURL || !parentURL.startsWith('file://')) return null;
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return null;
    if (KNOWN_EXTS.has(extname(specifier))) return null;
    const parentPath = fileURLToPath(parentURL);
    const candidate = resolvePath(dirname(parentPath), specifier);
    return probeOnDisk(candidate);
}

export async function resolve(specifier, context, nextResolve) {
    if (DISABLED) return nextResolve(specifier, context);

    if (
        specifier.startsWith('node:') ||
        specifier.startsWith('file:') ||
        specifier.startsWith('data:') ||
        specifier.startsWith('http:') ||
        specifier.startsWith('https:')
    ) {
        return nextResolve(specifier, context);
    }

    if (isAbsolute(specifier)) return nextResolve(specifier, context);

    // Bare alias.
    if (!specifier.startsWith('.')) {
        const hit = resolveAlias(specifier);
        if (hit) {
            return { url: pathToFileURL(hit).href, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    }

    // Relative, possibly extensionless.
    const relHit = resolveRelativeExtensionless(specifier, context.parentURL);
    if (relHit) {
        return { url: pathToFileURL(relHit).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
}
