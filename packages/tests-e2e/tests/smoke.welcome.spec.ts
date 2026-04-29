import { test, expect } from './fixtures';

test.describe('@smoke welcome', () => {
    test('renders the hero heading and "Welcome to Workbench" CTA', async ({ welcome }) => {
        // Hero h1 content varies by copy; at minimum it mentions the product.
        await expect(welcome.getByRole('heading', { level: 1 })).toContainText(/workbench|salesforce/i);
        // The page includes a "Welcome to Workbench" CTA block further down.
        await expect(welcome.getByText(/welcome to workbench/i).first()).toBeVisible();
    });

    test('landing root (/) renders the product App view with a heading', async ({ page }) => {
        await page.goto('/');
        await expect(page).toHaveTitle(/Workbench/i);
        await expect(page.getByRole('heading').first()).toBeVisible();
    });
});
