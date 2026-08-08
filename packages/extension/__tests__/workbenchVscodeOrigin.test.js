import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import {
    getChromeChatCopyTargets,
    getChromeCopyTargets,
    resolveWorkbenchVscodeOrigin,
} from '../../../tools/build/rollup.extension.mjs';

const manifestTemplate = fs.readFileSync('packages/extension/manifest.template.json', 'utf8');
const chatManifestTemplate = fs.readFileSync(
    'packages/extension-chat/manifest.template.json',
    'utf8'
);
const constantsSource = fs.readFileSync('packages/lwc/main/vscode/fullApp/constants.ts', 'utf8');

function withEnv(overrides, fn) {
    const previous = {};
    for (const key of Object.keys(overrides)) {
        previous[key] = process.env[key];
        if (overrides[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = overrides[key];
        }
    }
    try {
        return fn();
    } finally {
        for (const key of Object.keys(overrides)) {
            if (previous[key] === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = previous[key];
            }
        }
    }
}

function manifestFrameSrcFor(targets, template) {
    const manifestTarget = targets.find(t => t.rename === 'manifest.json');
    const transformed = manifestTarget.transform(template);
    const extensionPages = JSON.parse(transformed).content_security_policy.extension_pages;
    const match = extensionPages.match(/frame-src [^;]+;/);
    assert.ok(
        match,
        `expected extension_pages to contain a frame-src directive, got: ${extensionPages}`
    );
    return match[0];
}

test('resolveWorkbenchVscodeOrigin prefers WORKBENCH_VSCODE_URL, then WORKBENCH_BASE_URL, then the default', () => {
    assert.equal(
        resolveWorkbenchVscodeOrigin({ WORKBENCH_VSCODE_URL: 'https://vscode.sf-workbench.com/' }),
        'https://vscode.sf-workbench.com'
    );
    assert.equal(
        resolveWorkbenchVscodeOrigin({ WORKBENCH_BASE_URL: 'https://custom.example.com/' }),
        'https://custom.example.com'
    );
    assert.equal(resolveWorkbenchVscodeOrigin({}), 'https://www.sf-workbench.com');
});

test('main extension manifest frame-src matches resolveWorkbenchVscodeOrigin for the same env', () => {
    withEnv(
        { WORKBENCH_VSCODE_URL: 'https://vscode.sf-workbench.com', WORKBENCH_BASE_URL: undefined },
        () => {
            const targets = getChromeCopyTargets({ isProduction: true });
            const frameSrc = manifestFrameSrcFor(targets, manifestTemplate);
            assert.equal(frameSrc, `frame-src ${resolveWorkbenchVscodeOrigin()}/;`);
        }
    );
});

test('chat extension manifest frame-src matches resolveWorkbenchVscodeOrigin for the same env', () => {
    withEnv(
        { WORKBENCH_VSCODE_URL: undefined, WORKBENCH_BASE_URL: 'https://custom.example.com' },
        () => {
            const targets = getChromeChatCopyTargets(true);
            const frameSrc = manifestFrameSrcFor(targets, chatManifestTemplate);
            assert.equal(frameSrc, `frame-src ${resolveWorkbenchVscodeOrigin()}/;`);
        }
    );
});

test('vscode fullApp constants derive WORKBENCH_IFRAME_ORIGIN from process.env.WORKBENCH_VSCODE_URL', () => {
    // The JS bundle only gets the correct iframe origin if this literal expression survives —
    // the rollup `replace` plugin substitutes the exact string `process.env.WORKBENCH_VSCODE_URL`
    // with the value returned by resolveWorkbenchVscodeOrigin(). If this ever changes to a
    // different expression (e.g. its own fallback chain), it will silently diverge from the
    // manifest's frame-src again.
    assert.match(
        constantsSource,
        /WORKBENCH_IFRAME_ORIGIN\s*=\s*process\.env\.WORKBENCH_VSCODE_URL\s+as\s+string/
    );
});
