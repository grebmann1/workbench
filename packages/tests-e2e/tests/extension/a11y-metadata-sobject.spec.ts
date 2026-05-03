import AxeBuilder from '@axe-core/playwright';

import { test, expect } from './fixtures';

/**
 * Metadata Explorer and SObject both require a Salesforce connection
 * for their full feature UI. Without one, the shell renders the empty
 * / connection-prompt state. That still exposes header, menu, and
 * empty-state copy to axe.
 *
 * The MV3 service worker is lazy on first load. Warm it by first
 * navigating to an extension-internal URL (the default app shell URL),
 * then navigate to the target `applicationName`. Going straight to the
 * deep-link from a cold SW gets ERR_BLOCKED_BY_CLIENT.
 */

async function openAppRobust(
    context: import('@playwright/test').BrowserContext,
    extensionId: string,
    applicationName: string
) {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/views/app.html`);
    await page.waitForLoadState('domcontentloaded');
    await page.goto(
        `chrome-extension://${extensionId}/views/app.html?applicationName=${applicationName}`
    );
    await page.waitForLoadState('domcontentloaded');
    return page;
}

test.describe('@ext a11y — Metadata + SObject', () => {
    test('axe: no critical or serious violations on Metadata', async ({
        context,
        extensionId,
    }) => {
        const page = await openAppRobust(context, extensionId, 'metadata');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
        const serious = results.violations.filter(
            v => v.impact === 'critical' || v.impact === 'serious'
        );
        expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
    });

    test('axe: no critical or serious violations on SObject', async ({
        context,
        extensionId,
    }) => {
        const page = await openAppRobust(context, extensionId, 'sobject');
        const results = await new AxeBuilder({ page })
            .withTags(['wcag2a', 'wcag2aa'])
            .analyze();
        const serious = results.violations.filter(
            v => v.impact === 'critical' || v.impact === 'serious'
        );
        expect(serious, JSON.stringify(serious, null, 2)).toHaveLength(0);
    });
});
