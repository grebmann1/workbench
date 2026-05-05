import type { Page, Locator } from '@playwright/test';

/**
 * ARIA-role locator shorthands. These do NOT change selector behavior —
 * they're the same `getByRole` calls used across existing specs, wrapped
 * for brevity. Playwright's ARIA locators pierce the shadow DOM natively
 * so these work against LWC without any special syntax.
 */
export const h = (page: Page, name: string | RegExp): Locator =>
    page.getByRole('heading', { name });

export const btn = (page: Page, name: string | RegExp): Locator =>
    page.getByRole('button', { name });

export const link = (page: Page, name: string | RegExp): Locator =>
    page.getByRole('link', { name });

export const combo = (page: Page, name: string | RegExp): Locator =>
    page.getByRole('combobox', { name });

export const tbox = (page: Page, name: string | RegExp): Locator =>
    page.getByRole('textbox', { name });

export const tab = (page: Page, name: string | RegExp): Locator =>
    page.getByRole('tab', { name });
