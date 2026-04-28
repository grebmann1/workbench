import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
    fetchRemoteAnnouncement,
    isAnnouncementDismissed,
    markAnnouncementDismissed,
    normalizeAnnouncementPayload,
    resolveAnnouncementEndpoint,
} from '../announcements.ts';

function createStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
            values.set(key, value);
        },
        removeItem: (key: string) => {
            values.delete(key);
        },
    };
}

test('normalizeAnnouncementPayload accepts active plain-text announcements with safe links', () => {
    const announcement = normalizeAnnouncementPayload({
        announcement: {
            id: '  outage-1  ',
            active: true,
            variant: 'warning',
            title: '  Service issue  ',
            message: '  We are investigating degraded API responses.  ',
            linkLabel: '  View details  ',
            linkUrl: 'https://www.sf-workbench.com/status',
        },
    });

    assert.deepEqual(announcement, {
        id: 'outage-1',
        active: true,
        variant: 'warning',
        title: 'Service issue',
        message: 'We are investigating degraded API responses.',
        linkLabel: 'View details',
        linkUrl: 'https://www.sf-workbench.com/status',
    });
});

test('normalizeAnnouncementPayload rejects inactive, missing-message, and unsafe-link payloads', () => {
    assert.equal(
        normalizeAnnouncementPayload({
            announcement: {
                id: 'inactive',
                active: false,
                message: 'Hidden',
            },
        }),
        null
    );
    assert.equal(
        normalizeAnnouncementPayload({
            announcement: {
                id: 'missing-message',
                active: true,
                message: '',
            },
        }),
        null
    );
    assert.equal(
        normalizeAnnouncementPayload({
            announcement: {
                id: 'unsafe-link',
                active: true,
                message: 'Unsafe',
                linkUrl: 'javascript:alert(1)',
            },
        }),
        null
    );
});

test('fetchRemoteAnnouncement resolves the workbench endpoint and normalizes the response', async () => {
    const calls: string[] = [];
    const announcement = await fetchRemoteAnnouncement({
        baseUrl: 'https://api.sf-workbench.com/',
        fetchImpl: async url => {
            calls.push(String(url));
            return {
                ok: true,
                json: async () => ({
                    announcement: {
                        id: 'issue',
                        active: true,
                        message: 'Important update',
                    },
                }),
            } as Response;
        },
    });

    assert.equal(calls[0], 'https://api.sf-workbench.com/api/announcements');
    assert.equal(announcement?.id, 'issue');
});

test('fetchRemoteAnnouncement returns null when the endpoint fails', async () => {
    const announcement = await fetchRemoteAnnouncement({
        baseUrl: 'https://api.sf-workbench.com',
        fetchImpl: async () => ({ ok: false, status: 503 }) as Response,
    });

    assert.equal(announcement, null);
});

test('resolveAnnouncementEndpoint prefers the configured announcements URL', () => {
    assert.equal(
        resolveAnnouncementEndpoint(' https://status.example.com/workbench-announcements.json/// '),
        'https://status.example.com/workbench-announcements.json'
    );
});

test('resolveAnnouncementEndpoint falls back to the workbench base URL', () => {
    assert.equal(
        resolveAnnouncementEndpoint('', ' https://api.sf-workbench.com/// '),
        'https://api.sf-workbench.com/api/announcements'
    );
});

test('dismissal helpers persist dismissed announcement ids once', async () => {
    globalThis.window = { localStorage: createStorage() } as unknown as Window & typeof globalThis;

    assert.equal(await isAnnouncementDismissed('outage-1'), false);
    await markAnnouncementDismissed('outage-1');
    await markAnnouncementDismissed('outage-1');

    assert.equal(await isAnnouncementDismissed('outage-1'), true);
    assert.equal(await isAnnouncementDismissed('outage-2'), false);
});
