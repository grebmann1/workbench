import { expect, type Page } from '@playwright/test';

/**
 * Wait for the extension shell to finish booting its connector. We use
 * the presence of the app's first heading as the ready signal — the
 * shell renders skeletons first, then hydrates once `connector.conn` is
 * available. 15s is the same budget the offline `appPage` fixture uses.
 *
 * If individual live specs need a tighter signal (e.g. a spinner must
 * disappear before querying), they should do their own follow-up wait
 * rather than bloat this helper.
 */
export async function waitForConnector(page: Page, { timeout = 15_000 } = {}): Promise<void> {
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout });
}
