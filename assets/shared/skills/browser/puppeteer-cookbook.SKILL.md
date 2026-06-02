---
name: puppeteer-cookbook
description: Practical Puppeteer execution patterns for navigation, extraction, forms, waits, retries, and state verification.
---

# Puppeteer Cookbook

Use this skill for tactical browser steps.

## Baseline loop

1. Connect to page (`connectToPage(tabId)`).
2. Navigate (`page.goto(...)`).
3. Wait (`waitForPageLoad` or `waitForLightning` on Salesforce).
4. Inspect (`getSnapshot` / quick evaluate checks).
5. Interact once.
6. Re-evaluate state.

## Reliable patterns

- Use `Promise.all([page.waitForNavigation(), click])` when click triggers full navigation.
- Use explicit waiters for dynamic content (`waitForFunction`, `waitForSelector`).
- For text-heavy processing, write data to filesystem then process via bash tools.

## Failure handling

- On selector/action failure: screenshot + URL/title + short body text.
- Retry with fresh snapshot refs (do not reuse stale handles).
