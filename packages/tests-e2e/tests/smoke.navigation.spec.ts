import { test, expect } from '@playwright/test';

/**
 * Navigation smoke. The Workbench landing site (apps/ui) has a narrow
 * router: only `/` (App) and `/welcome/` (Welcome) are rendered, and
 * there is no in-site link between them in the current copy (Welcome is
 * reached via a `chrome-extension://` redirect, and the SiteHeader is
 * explicitly hidden on Welcome — see apps/ui/src/Welcome.tsx:187).
 *
 * Rather than exercising a non-existent round-trip, this spec covers
 * what the header actually links to: the brand anchor at "/" and the
 * #faq in-page jump link, both routed through the header.
 */
test.describe('@smoke navigation', () => {
    test('header brand anchor points at "/"', async ({ page }) => {
        await page.goto('/');
        const brand = page.locator('header a.brand').first();
        await expect(brand).toBeVisible();
        await expect(brand).toHaveAttribute('href', '/');
    });

    test('clicking the header brand keeps the user at the landing root', async ({ page }) => {
        await page.goto('/');
        await page.locator('header a.brand').first().click();
        await page.waitForURL(/\/$/);
        expect(new URL(page.url()).pathname).toBe('/');
    });

    test('footer FAQ link jumps to #faq on the same page', async ({ page }) => {
        // The footer renders <a href="/#faq">…</a> (see SiteChrome.tsx).
        // We verify the anchor attribute rather than clicking (clicking
        // triggers fragment nav that Playwright resolves as the same URL,
        // but with a "#faq" hash — assert the hash update instead).
        await page.goto('/');
        const faqLink = page.locator('a[href="/#faq"]').first();
        await expect(faqLink).toBeVisible();
        await faqLink.click();
        await page.waitForURL(/#faq$/);
        expect(new URL(page.url()).hash).toBe('#faq');
    });
});
