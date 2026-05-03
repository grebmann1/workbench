import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';

/**
 * SOQL Explorer requires a Salesforce connection for its full feature
 * shell. In the Playwright extension smoke environment there is no
 * connected org, so the shell renders the empty / connection-prompt
 * state. That's still a meaningful axe surface — header, menu, empty
 * state copy.
 *
 * The MV3 service worker is lazy on first load. Warm it by navigating
 * to an extension-internal URL first (the manifest's action popup /
 * options page) before deep-linking to `app.html?applicationName=soql`,
 * otherwise `page.goto` gets ERR_BLOCKED_BY_CLIENT. `context.newPage()`
 * on Chrome-for-Testing loads `about:blank` which does not register
 * anything, so we explicitly goto an extension URL.
 */

async function openAppRobust(
    context: import('@playwright/test').BrowserContext,
    extensionId: string,
    applicationName: string
) {
    const page = await context.newPage();
    // Warm: touch any extension-internal URL first. views/app.html with
    // no applicationName falls through to the default shell surface and
    // is always reachable.
    await page.goto(`chrome-extension://${extensionId}/views/app.html`);
    await page.waitForLoadState('domcontentloaded');
    // Now navigate to the target app in the same tab — SW is registered.
    await page.goto(
        `chrome-extension://${extensionId}/views/app.html?applicationName=${applicationName}`
    );
    await page.waitForLoadState('domcontentloaded');
    return page;
}

test.describe('@ext a11y — SOQL Explorer', () => {
    test('axe: no critical or serious violations on SOQL page', async ({
        context,
        extensionId,
    }) => {
        const page = await openAppRobust(context, extensionId, 'soql');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
        const serious = results.violations.filter(
            v => v.impact === 'critical' || v.impact === 'serious'
        );
        expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
    });

    test('field tree (if rendered) has role=tree with accessible name', async ({
        context,
        extensionId,
    }) => {
        const page = await openAppRobust(context, extensionId, 'soql');
        const count = await page.locator('[role="tree"]').count();
        // The field tree only mounts after a connection + sobject
        // selection. In the extension smoke environment there is no
        // connection, so the tree may not appear. Assert the a11y
        // contract only when the tree is actually in the DOM.
        if (count > 0) {
            const tree = page.locator('[role="tree"]').first();
            await expect(tree).toHaveAttribute('aria-label', /fields/i);
        }
    });
});
