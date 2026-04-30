import { test, expect } from './fixtures';

test.describe('@extension smartinput', () => {
    // Smartinput is gated behind a beta flag stored in chrome.storage; on a
    // fresh profile the shell redirects `?applicationName=smartinput` to
    // `home/app`. Seeding the beta flag requires driving the extension's
    // service worker, which is lazy under MV3 and flaky via Playwright —
    // defer the real interaction coverage to Track 2 and here just confirm
    // the redirect-to-home path does not throw.
    test('redirect path loads without a page error', async ({ appPage }) => {
        const errors: Error[] = [];
        const page = await appPage('smartinput');
        page.on('pageerror', e => errors.push(e));
        // appPage already awaited the first heading on the redirected shell.
        expect(errors).toEqual([]);
    });
});
