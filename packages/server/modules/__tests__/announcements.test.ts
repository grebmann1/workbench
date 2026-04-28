import assert from 'node:assert/strict';
import { test } from 'node:test';

import { __testables } from '../announcements';

const { selectAnnouncement } = __testables;

test('selectAnnouncement returns the active announcement inside its date window', () => {
    const selected = selectAnnouncement(
        [
            {
                id: 'future',
                active: true,
                message: 'Not yet',
                startsAt: '2026-05-01T00:00:00Z',
            },
            {
                id: 'current',
                active: true,
                variant: 'warning',
                title: 'Service issue',
                message: 'We are investigating degraded API responses.',
                linkLabel: 'View details',
                linkUrl: 'https://www.sf-workbench.com/status',
                startsAt: '2026-04-28T00:00:00Z',
                endsAt: '2026-04-29T00:00:00Z',
            },
        ],
        new Date('2026-04-28T12:00:00Z')
    );

    assert.deepEqual(selected, {
        id: 'current',
        active: true,
        variant: 'warning',
        title: 'Service issue',
        message: 'We are investigating degraded API responses.',
        linkLabel: 'View details',
        linkUrl: 'https://www.sf-workbench.com/status',
        startsAt: '2026-04-28T00:00:00Z',
        endsAt: '2026-04-29T00:00:00Z',
    });
});

test('selectAnnouncement returns null for inactive, expired, malformed, or unsafe announcements', () => {
    const selected = selectAnnouncement(
        [
            {
                id: 'inactive',
                active: false,
                message: 'Hidden',
            },
            {
                id: 'expired',
                active: true,
                message: 'Expired',
                endsAt: '2026-04-27T00:00:00Z',
            },
            {
                id: 'missing-message',
                active: true,
                message: '',
            },
            {
                id: 'unsafe-link',
                active: true,
                message: 'Unsafe link',
                linkUrl: 'javascript:alert(1)',
            },
        ],
        new Date('2026-04-28T12:00:00Z')
    );

    assert.equal(selected, null);
});
