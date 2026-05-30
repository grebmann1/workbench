/**
 * Tests for the N9a recordviewer command registration.
 *
 * Contract verified here:
 *   - `registerRecordViewerCommands` registers `recordviewer.open` against
 *     the host-api commands registry.
 *   - The registered handler validates the `recordId` payload via
 *     `asSalesforceId` and silently rejects malformed input (returns
 *     `undefined`) instead of throwing — calling code dispatches a
 *     navigate action via the legacy store, which we stub by spying on
 *     `hasCommand` + `invokeCommand` semantics.
 *
 * Why we import the helper, not `app.ts`
 * --------------------------------------
 * `app.ts` transitively pulls in `lightning/toast`, `lwr/navigation`,
 * `lwc`, `host-api/element`, `host-api/builder`, `recordviewer/slices`,
 * `host-api/store` — all of which choke `node --test` (LWC `@api`
 * decorators, LWR runtime modules). The bootstrap that runs at
 * module-eval was extracted into `recordviewerCommands.ts` for exactly
 * this reason; the test imports the extracted helper directly.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    hasCommand,
    invokeCommand,
    __resetCommandsForTests,
    // @ts-expect-error TS5097: extension required at runtime.
} from '../../../../main/host-api/commands.ts';
import {
    registerRecordViewerCommands,
    __resetRecordViewerCommandsForTests,
    // @ts-expect-error TS5097: extension required at runtime.
} from '../recordviewerCommands.ts';

test('registerRecordViewerCommands registers recordviewer.open', () => {
    __resetCommandsForTests();
    __resetRecordViewerCommandsForTests();
    assert.equal(hasCommand('recordviewer.open'), false);
    registerRecordViewerCommands();
    assert.equal(hasCommand('recordviewer.open'), true);
});

test('registerRecordViewerCommands is idempotent', () => {
    __resetCommandsForTests();
    __resetRecordViewerCommandsForTests();
    registerRecordViewerCommands();
    // Second call must not throw and must leave the command registered.
    assert.doesNotThrow(() => registerRecordViewerCommands());
    assert.equal(hasCommand('recordviewer.open'), true);
});

test('recordviewer.open silently rejects malformed recordIds', async () => {
    __resetCommandsForTests();
    __resetRecordViewerCommandsForTests();
    registerRecordViewerCommands();
    // 'foo' is not a 15- or 18-char id — `asSalesforceId` throws inside
    // the handler, but `safeRecordId` swallows the throw and the
    // handler returns undefined without dispatching navigation.
    const result = await invokeCommand('recordviewer.open', { recordId: 'foo' });
    assert.equal(result, undefined);
});

test('recordviewer.open silently rejects an empty recordId', async () => {
    __resetCommandsForTests();
    __resetRecordViewerCommandsForTests();
    registerRecordViewerCommands();
    const result = await invokeCommand('recordviewer.open', { recordId: '' });
    assert.equal(result, undefined);
});
