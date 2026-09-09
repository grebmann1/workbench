import assert from 'node:assert/strict';
import { test } from 'node:test';

import { waitUntilNotLoading } from '../waitForLoaded.ts';

test('waitUntilNotLoading: resolves immediately when not loading', async () => {
    await waitUntilNotLoading(() => false, 50);
});

test('waitUntilNotLoading: times out when still loading', async () => {
    await assert.rejects(
        () => waitUntilNotLoading(() => true, 40),
        /Timed out waiting for application to load after 40ms/
    );
});
