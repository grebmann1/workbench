import fs from 'node:fs/promises';
import { test, expect } from './fixtures';
import { mockOrg, ORIGIN } from './salesforceFixture';

for (const width of [1280, 400]) {
    test(`the error log closes with its icon or Escape at ${width}px`, async ({
        context,
        extensionId,
    }) => {
        await mockOrg(context);
        const page = await context.newPage();
        await page.setViewportSize({ width, height: 720 });
        await page.goto(
            `chrome-extension://${extensionId}/views/app.html?${new URLSearchParams({ applicationName: 'metadata', sessionId: 'fixture-session-only', serverUrl: ORIGIN })}`
        );
        const footer = page.locator('skeleton-footer');
        const launcher = footer.locator('.footer-error-message');
        await expect(launcher).toBeVisible({ timeout: 15000 });
        await launcher.click();
        const panel = footer.getByRole('dialog', { name: 'Error Log', exact: true });
        const close = panel.getByRole('button', { name: 'Close error log', exact: true });
        await expect(close).toBeFocused();
        const bounds = await panel.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
        await fs.mkdir('.zcc/artifacts/footer-panels', { recursive: true });
        await page.screenshot({ path: `.zcc/artifacts/footer-panels/error-log-${width}.png` });
        // Hit the rendered icon, including when its decorative SVG ignores pointer events.
        const icon = await close.locator('svg').boundingBox();
        expect(icon).not.toBeNull();
        await page.mouse.click(icon!.x + icon!.width / 2, icon!.y + icon!.height / 2);
        await expect(panel).toBeHidden();
        await expect(launcher).toBeFocused();
        await expect(launcher).toHaveAttribute('aria-expanded', 'false');
        await launcher.press('Enter');
        await expect(close).toBeFocused();
        const filter = panel.getByRole('textbox', { name: 'Filter errors', exact: true });
        await filter.fill('global metadata');
        await filter.press('Escape');
        await expect(panel).toBeHidden();
        await expect(launcher).toBeFocused();
        await launcher.press('Space');
        await expect(panel).toBeVisible();
        await expect(panel).toContainText('Error fetching global metadata');
        await close.click();
        await expect(panel).toBeHidden();
    });
}
