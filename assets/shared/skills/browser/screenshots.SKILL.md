---
name: screenshots
description: Capture and use screenshots for visual verification via page.screenshot + logImage with pragmatic limits.
---

# Screenshots

Use screenshots to verify state before/after critical actions.

## Pattern

```javascript
const shot = await page.screenshot({ encoding: "base64" });
logImage(shot);
```

## Best practices

- Capture before destructive actions and after key transitions.
- Prefer focused, purposeful screenshots over excessive capture.
- Pair screenshot with URL + title checks when debugging navigation failures.
