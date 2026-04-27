# tools/testing — shared unit-test harness

Node 22's built-in test runner (`node --test --experimental-strip-types`) is used project-wide. This folder holds reusable mocks so each test doesn't reinvent them.

## Import

```ts
import {
    createFetchMock,
    createStorageMock,
    createChromeMock,
    createTestStore,
    createConnectionMock,
    createConnectorMock,
} from '../../../../tools/testing/index.ts';
```

Relative paths depend on your test file location. Keep the `.ts` extension — the test runner requires it with `--experimental-strip-types`.

## Helpers

### `createFetchMock({ routes?, default? })`
Programmable `fetch` stub. `routes` is an array of `{ match: string | RegExp, handler }`. `handler` may return a `Response` or `{ status, body, headers }`. `install(target=globalThis)` swaps `globalThis.fetch`; `restore()` reverts. `calls` is a live array of `{ url, init }` for assertions.

```ts
const fm = createFetchMock({
    routes: [{ match: /\/services\/data/, handler: () => ({ body: { records: [] } }) }],
});
const restore = fm.install();
try { /* test body */ } finally { restore(); }
```

### `createStorageMock(initial?)`
In-memory `StorageStore` (`get`, `set`, `remove`, `clear`, `keys`). Pass `initial` to preload.

### `createChromeMock({ runtimeHandler?, tabs? })`
Builds a `chrome.*` namespace shim: `chrome.storage.local/sync` (both backed by `createStorageMock`), `chrome.runtime.sendMessage/onMessage/getURL/id`, `chrome.tabs.query/sendMessage`. Assign to `(globalThis as any).chrome` before the module under test imports.

### `createTestStore({ reducers?, preloadedState?, middlewares? })`
Thin wrapper around `configureStore` that records every dispatched action into `.dispatched` and disables RTK's serializable/immutable checks (they fight with non-serializable mock state).

`waitForState(store, predicate, { timeoutMs })` resolves when `predicate(getState())` returns truthy.

### `createConnectionMock(options?)`
jsforce-shaped `Connection` stub. Every method has an empty-ish default; pass overrides per test:

```ts
const conn = createConnectionMock({
    query: async soql => ({ done: true, totalSize: 1, records: [{ Id: '001x' }] }),
});
```

### `createConnectorMock({ conn?, alias?, configuration? })`
Shape the Workbench `Connector` class exposes to apps: `{ alias, conn, configuration, frontDoorUrl }`.

## Pattern

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorageMock } from '../../../../../tools/testing/index.ts';
import { moduleUnderTest } from '../moduleUnderTest.ts';

test('my behavior', async () => {
    const storage = createStorageMock();
    // wire storage into the module …
    const result = await moduleUnderTest(storage);
    assert.equal(result, 'expected');
});
```

## Don't

- Don't install `jsdom`, `msw`, `sinon`, or any new dep.
- Don't use `describe` / `it` / `expect` — use `node:test` + `node:assert/strict`.
- Don't share state between tests; create a fresh mock per `test()`.
