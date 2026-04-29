import assert from 'node:assert/strict';
import { test } from 'node:test';

// Stub `window.localStorage` so basicStore (used in Node, no chrome) works.
class MemoryStorage {
    private map = new Map<string, string>();
    getItem(key: string) {
        return this.map.has(key) ? this.map.get(key)! : null;
    }
    setItem(key: string, value: string) {
        this.map.set(key, value);
    }
    removeItem(key: string) {
        this.map.delete(key);
    }
    clear() {
        this.map.clear();
    }
}

const memStore = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = {
    localStorage: memStore,
    sessionStorage: new MemoryStorage(),
};
(globalThis as unknown as { document: unknown }).document = {
    title: 'Test Title',
    location: { href: 'https://test.example/path' },
};

type CapturedRequest = { url: string; init: RequestInit | undefined };
const captured: CapturedRequest[] = [];

(globalThis as unknown as { fetch: unknown }).fetch = async (url: string, init?: RequestInit) => {
    captured.push({ url, init });
    return new Response(null, { status: 200 });
};

// Dynamic import so stubs are installed first.
const { default: Analytics } = await import('../analytics.ts');

test('configure: accepts new measurement/api secret without throwing', () => {
    Analytics.configure({ measurementId: 'G-TEST', apiSecret: 'secret-xyz' });
    Analytics.configure(); // no-arg
    Analytics.configure({});
});

test('track: posts a GA event with session_id + engagement time', async () => {
    captured.length = 0;
    memStore.clear();
    await Analytics.track('custom_event', { foo: 'bar' });
    assert.equal(captured.length, 1);
    const { url, init } = captured[0];
    assert.ok(url.startsWith('https://www.google-analytics.com/mp/collect?'));
    assert.ok(url.includes('measurement_id=G-TEST'));
    assert.equal(init?.method, 'POST');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.events[0].name, 'custom_event');
    assert.equal(body.events[0].params.foo, 'bar');
    assert.ok(typeof body.events[0].params.session_id === 'string');
    assert.equal(body.events[0].params.engagement_time_msec, 100);
    assert.ok(typeof body.client_id === 'string' && body.client_id.length > 0);
});

test('track: reuses persisted client_id across calls', async () => {
    captured.length = 0;
    await Analytics.track('second_event');
    await Analytics.track('third_event');
    assert.equal(captured.length, 2);
    const first = JSON.parse(captured[0].init!.body as string).client_id;
    const second = JSON.parse(captured[1].init!.body as string).client_id;
    assert.equal(first, second);
});

test('trackAppOpen: emits app_opened event with app_name', async () => {
    captured.length = 0;
    await Analytics.trackAppOpen('soql', { entrypoint: 'menu' });
    assert.equal(captured.length, 1);
    const event = JSON.parse(captured[0].init!.body as string).events[0];
    assert.equal(event.name, 'app_opened');
    assert.equal(event.params.app_name, 'soql');
    assert.equal(event.params.entrypoint, 'menu');
});

test('trackAction: emits app_action with action_name', async () => {
    captured.length = 0;
    await Analytics.trackAction('metadata', 'run_query', { rows: 5 });
    const event = JSON.parse(captured[0].init!.body as string).events[0];
    assert.equal(event.name, 'app_action');
    assert.equal(event.params.app_name, 'metadata');
    assert.equal(event.params.action_name, 'run_query');
    assert.equal(event.params.rows, 5);
});

test('trackError: extracts message from Error instances', async () => {
    captured.length = 0;
    await Analytics.trackError('api', new Error('boom'));
    const event = JSON.parse(captured[0].init!.body as string).events[0];
    assert.equal(event.name, 'app_error');
    assert.equal(event.params.app_name, 'api');
    assert.equal(event.params.message, 'boom');
});

test('trackError: stringifies non-Error inputs', async () => {
    captured.length = 0;
    await Analytics.trackError('api', 'something went wrong');
    const event = JSON.parse(captured[0].init!.body as string).events[0];
    assert.equal(event.params.message, 'something went wrong');
    captured.length = 0;
    await Analytics.trackError('api', null);
    const nullEvent = JSON.parse(captured[0].init!.body as string).events[0];
    assert.equal(nullEvent.params.message, 'null');
});

test('trackError: swallows fetch failures', async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as unknown as { fetch: unknown }).fetch = async () => {
        throw new Error('network');
    };
    try {
        // Should not throw.
        await Analytics.trackError('api', new Error('x'));
    } finally {
        (globalThis as unknown as { fetch: unknown }).fetch = originalFetch;
    }
});

test('trackPageView: uses provided fields then falls back to document', async () => {
    captured.length = 0;
    await Analytics.trackPageView({ appName: 'soql', pageTitle: 'Explorer' });
    const event = JSON.parse(captured[0].init!.body as string).events[0];
    assert.equal(event.name, 'page_view');
    assert.equal(event.params.page_title, 'Explorer');
    assert.equal(event.params.app_name, 'soql');
    assert.equal(event.params.page_location, 'https://test.example/path');
});
