import { test, expect } from '@playwright/test';

/**
 * Landing root (/) smoke. Covers the non-/welcome/ branch of
 * apps/ui/src/main.tsx, which mounts the App component (marketing site
 * with hero, feature sections, and FAQ).
 *
 * The existing smoke.welcome.spec already touches `/` once, but only
 * checks the title + first heading. This spec locks in more structural
 * promises: document title, a visible <h1>, and a link to the Chrome
 * Web Store for installation.
 */
test.describe('@smoke landing', () => {
    test('document title mentions Workbench', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Workbench/i);
    });

    test('root <h1> is present and visible', async ({ page }) => {
        await page.goto('/');
        const h1 = page.getByRole('heading', { level: 1 }).first();
        await expect(h1).toBeVisible();
        const text = (await h1.textContent())?.trim() ?? '';
        expect(text.length, 'h1 should have some text').toBeGreaterThan(0);
    });

    test('page links to the Chrome Web Store', async ({ page }) => {
        // Reference from apps/ui/src/SiteChrome.tsx:
        //   CHROME_STORE_URL = '...chromewebstore.google.com/detail/...'
        // Use a regex rather than hardcoding the full URL so locale / detail
        // slug changes stay resilient.
        await page.goto('/');
        const cwsLinks = page.locator('a[href^="https://chromewebstore.google.com/"]');
        await expect(cwsLinks.first()).toBeVisible();
        const count = await cwsLinks.count();
        expect(count, 'expected at least one Chrome Web Store install link').toBeGreaterThan(0);
    });

    test('at least one feature-section image is rendered', async ({ page }) => {
        // App.tsx renders FEATURE_SECTIONS screenshots inside FakeBrowser
        // components. The <img> in FakeBrowser carries class
        // "fake-browser-screenshot" (see apps/ui/src/SiteChrome.tsx:181).
        // This locks in that the hydrated page actually painted at least
        // one feature screenshot rather than leaving placeholders.
        await page.goto('/');
        const featureImgs = page.locator('img.fake-browser-screenshot');
        await expect(featureImgs.first()).toBeVisible({ timeout: 5_000 });
    });
});
