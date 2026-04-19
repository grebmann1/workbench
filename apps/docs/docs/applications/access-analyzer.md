---
title: Access Analyzer
---

# Access Analyzer

**Menu path:** Explorers → Access Analyzer  
**URL parameter:** `applicationName=access`

The Access Analyzer lets you compare the effective permissions of two profiles or permission sets side by side. Use it to audit what a user can see, edit, or execute — and spot gaps or over-provisioned access quickly.

---

## Getting started

1. Open Workbench and connect to an org.
2. Click **Access Analyzer** in the left menu (under **Explorers**).
3. Select the **type** you want to compare: **Profile** or **Permission Set**.
4. Pick the first profile or permission set from the left dropdown.
5. Pick the second from the right dropdown.
6. Click **Analyze** — Workbench fetches permissions for both and renders the comparison.

---

## What the analyzer compares

### Object-level permissions

For each SObject, the table shows Create, Read, Edit, Delete, View All, and Modify All permissions for both selections side by side. Differences are highlighted so you can identify where the two diverge.

### Field-level security

Switch to the **Fields** tab to compare field-level read and edit permissions across all fields for a selected object.

### System permissions

The **System** tab compares administrative and special permissions (e.g. "Modify All Data", "View Setup and Configuration", "API Enabled").

### Apex class and VF page access

The **Apex / Pages** tab lists which Apex classes and Visualforce pages are enabled for each selection.

---

## Use cases

- **Troubleshooting access issues** — compare a user's profile against a permission set to understand the combined effective access.
- **Permission set design** — compare a proposed permission set against the baseline profile before assigning it to users.
- **Compliance audits** — verify that sensitive objects have restricted access and document differences between user groups.

---

## Tips

- The analyzer shows the permissions configured in the profile or permission set — not the user's final effective access (which is the union of the profile and all assigned permission sets). To analyze effective access for a specific user, check their permission set assignments first.
- Use [Org Overview](./org-overview) to find the list of profiles and permission sets in the org before opening the analyzer.

---

## Related tools

- [Org Overview](./org-overview) — see how many users are on each profile
- [SObject Explorer](./sobject-explorer) — understand field metadata before reviewing field-level security
