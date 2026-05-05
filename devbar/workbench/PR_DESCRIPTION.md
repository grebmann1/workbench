# PR Title

Add Workbench Chrome extension to DevBar

## Summary

- Adds an initial Workbench DevBar tool entry for the Chrome extension.
- Adds a macOS script that opens the Workbench Chrome Web Store listing.
- Documents Workbench Desktop/macOS app installation as a deferred follow-up.

## Why

Workbench gives Salesforce builders a browser-native toolkit for SOQL, metadata, API exploration,
org access, and AI-assisted workflows. The Chrome extension is the best first DevBar surface because
it attaches directly to Salesforce browser sessions and avoids desktop installer/release concerns in
the initial PR.

## Notes for Reviewers

- The initial script only opens the Chrome Web Store listing. Auto-installing a Chrome extension may
  require enterprise policy or elevated script privileges.
- Workbench Desktop/macOS app installation is intentionally deferred until the macOS release asset
  and installer shape are ready for DevBar.
- Please reconcile `tool.yaml` field names with the internal DevBar schema before merging.

## Validation

- YAML parses for `tool.yaml`.
- Chrome extension script passes `bash -n`.
- Running the script opens the Workbench Chrome Web Store listing.

## Follow-Ups

- Add Chrome enterprise policy installation if DevBar scripts can run with the required privileges.
- Add Workbench Desktop macOS install/update support as a separate follow-up PR.
