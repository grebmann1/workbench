import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const APPS_DIR = resolve(import.meta.dirname, '../../../../applications');

type Manifest = {
    id: string;
    name: string;
    label: string;
    path: string;
    type?: string;
    menuGroup?: string;
    menuOrder?: number;
    flags?: Record<string, boolean>;
};

function loadManifests(): Array<{ dir: string; manifest: Manifest }> {
    const out: Array<{ dir: string; manifest: Manifest }> = [];
    for (const dir of readdirSync(APPS_DIR, { withFileTypes: true })) {
        if (!dir.isDirectory()) continue;
        const manifestPath = resolve(APPS_DIR, dir.name, `${dir.name}.manifest.json`);
        try {
            const raw = readFileSync(manifestPath, 'utf8');
            out.push({ dir: dir.name, manifest: JSON.parse(raw) as Manifest });
        } catch {
            // no manifest — skip (not every app has one during refactor)
        }
    }
    return out;
}

const MANIFESTS = loadManifests();

// Known menu groups from skeleton/registry.
const KNOWN_MENU_GROUPS = new Set(['data', 'code', 'admin', 'deploy', 'utilities']);

test('applications registry: finds at least one manifest', () => {
    assert.ok(MANIFESTS.length >= 1, `expected >=1 manifests, got ${MANIFESTS.length}`);
});

test('applications registry: every manifest has id, name, label, path', () => {
    for (const { dir, manifest } of MANIFESTS) {
        assert.ok(manifest.id, `${dir}: missing id`);
        assert.ok(manifest.name, `${dir}: missing name`);
        assert.ok(manifest.label, `${dir}: missing label`);
        assert.ok(manifest.path, `${dir}: missing path`);
    }
});

test('applications registry: name matches <app>/app convention', () => {
    for (const { dir, manifest } of MANIFESTS) {
        assert.match(manifest.name, /^[a-zA-Z]+\/app$/, `${dir}: name '${manifest.name}'`);
    }
});

test('applications registry: path values are unique', () => {
    const seen = new Map<string, string>();
    for (const { dir, manifest } of MANIFESTS) {
        const existing = seen.get(manifest.path);
        assert.equal(
            existing,
            undefined,
            `duplicate path '${manifest.path}' in ${dir} and ${existing}`
        );
        seen.set(manifest.path, dir);
    }
});

test('applications registry: id values are unique', () => {
    const seen = new Map<string, string>();
    for (const { dir, manifest } of MANIFESTS) {
        const existing = seen.get(manifest.id);
        assert.equal(existing, undefined, `duplicate id '${manifest.id}'`);
        seen.set(manifest.id, dir);
    }
});

test('applications registry: menuGroup values live in the known set', () => {
    for (const { dir, manifest } of MANIFESTS) {
        if (manifest.menuGroup === undefined) continue;
        assert.ok(
            KNOWN_MENU_GROUPS.has(manifest.menuGroup),
            `${dir}: unknown menuGroup '${manifest.menuGroup}'`
        );
    }
});

test('applications registry: flags are booleans when present', () => {
    for (const { dir, manifest } of MANIFESTS) {
        if (!manifest.flags) continue;
        for (const [key, value] of Object.entries(manifest.flags)) {
            assert.equal(typeof value, 'boolean', `${dir}: flag '${key}' not boolean`);
        }
    }
});
