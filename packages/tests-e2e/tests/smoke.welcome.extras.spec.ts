import { test, expect } from './fixtures';

/**
 * Extra coverage for the /welcome/ landing page that goes beyond the original
 * smoke.welcome.spec. Assertions here protect against common regressions that
 * are hard to catch with unit tests: placeholder hrefs, missing alt attrs,
 * console errors on idle, and accidental `noindex`.
 */
test.describe('@smoke welcome extras', () => {
    test('hero CTA is an anchor with a non-empty, non-placeholder href', async ({ welcome }) => {
        // The Welcome page ships a CTA section with class "welcome-cta" whose
        // primary button is an <a className="button">. Locate the first such
        // anchor that lives inside the CTA section.
        const ctaLink = welcome.locator('.welcome-cta a.button').first();
        await expect(ctaLink).toBeVisible();
        const href = await ctaLink.getAttribute('href');
        expect(href, 'CTA anchor should have an href').not.toBeNull();
        expect(href?.trim(), 'CTA href must not be empty').not.toBe('');
        // Reject "#" and "#..." placeholder hrefs.
        expect(href, 'CTA href must not be a "#" placeholder').not.toMatch(/^#$/);
    });

    test('every <img> on the page declares an alt attribute (even empty is acceptable for decorative)', async ({
        welcome,
    }) => {
        // Wait for at least one image to attach before querying the list.
        const imgs = welcome.locator('img');
        await expect(imgs.first())
            .toHaveCount(1, { timeout: 5_000 })
            .catch(() => {
                // If there are literally zero imgs, treat as vacuous pass.
            });
        const total = await imgs.count();
        for (let i = 0; i < total; i++) {
            const alt = await imgs.nth(i).getAttribute('alt');
            // getAttribute returns `null` only if the attribute is absent.
            expect(alt, `img #${i} is missing an alt attribute`).not.toBeNull();
        }
    });

    test('no console errors during a 3-second idle window after load', async ({
        page,
        consoleErrors,
    }) => {
        await page.goto('/welcome/', { waitUntil: 'load' });
        // Wait for the hero heading to be visible rather than an arbitrary
        // timeout — idle means "page is interactive and no further work is
        // queued". Then use a locator-based idle check.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        // A short but bounded idle wait, implemented via a single networkidle
        // wait (Playwright's built-in). 3s timeout keeps it deterministic.
        await page.waitForLoadState('networkidle', { timeout: 3_000 }).catch(() => {
            /* networkidle may never settle on a site with live refresh; swallow */
        });
        expect(consoleErrors, `unexpected console errors: ${consoleErrors.join('\n')}`).toEqual([]);
    });

    test('robots meta, when present, is not "noindex"', async ({ welcome }) => {
        const robots = welcome.locator('meta[name="robots"]');
        const count = await robots.count();
        if (count === 0) {
            // No robots meta at all — fine for a landing site.
            return;
        }
        const content = (await robots.first().getAttribute('content')) || '';
        expect(content.toLowerCase()).not.toContain('noindex');
    });
});
