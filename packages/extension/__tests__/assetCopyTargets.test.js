import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';

import { getAssetCopyTargets } from '../../../tools/build/rollup.extension.mjs';

test('getAssetCopyTargets omits vscode, SLDS non-sprites, maps, and unused vendor libs', () => {
    const targets = getAssetCopyTargets('../../dist/extension');
    const srcs = targets.map(t => String(t.src).replace(/\\/g, '/'));

    assert.equal(
        srcs.some(src => src.endsWith('/assets/extension/libs') || src.includes('/libs/vscode')),
        false,
        'must not copy the whole libs tree or libs/vscode'
    );
    assert.equal(
        srcs.some(
            src => src.includes('@salesforce-ux/design-system/assets') && !src.includes('/icons/')
        ),
        false,
        'must not copy full SLDS assets'
    );
    assert.ok(
        srcs.some(src => src.includes('/icons/utility-sprite')),
        'must copy SLDS utility-sprite'
    );
    assert.ok(
        srcs.some(src => src.endsWith('/libs/monaco') || src.includes('/libs/monaco')),
        'must copy standalone monaco'
    );
    assert.ok(srcs.some(src => src.includes('/workers/*.js')));
    assert.equal(
        srcs.some(src => src.includes('jsforce')),
        false
    );
    assert.equal(
        srcs.some(src => src.includes('jspdf')),
        false
    );
    assert.equal(
        srcs.some(src => src.includes('just-bash')),
        false
    );

    const dests = targets.map(t => String(t.dest).replace(/\\/g, '/'));
    assert.ok(
        dests.some(
            dest => dest.endsWith(`${path.posix.sep}assets/icons`) || dest.endsWith('/assets/icons')
        )
    );
});
