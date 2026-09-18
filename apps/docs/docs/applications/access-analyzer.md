---
title: Access Analyzer
---

# Access Analyzer

**Menu path:** Admin → Access Analyzer

**URL parameter:** `applicationName=access`

Investigate one user's access to a record and field, or compare the permissions configured in profiles and permission sets.

## Investigate user access

Open **Admin → Access Analyzer** and enter an object API name, record ID and optional field API name. You can copy these from [Record Viewer](./record-viewer).

1. Use **Find users** to search by name, username or a 005 user ID. Select the target user. The connected user and target user are shown separately.
2. Choose **Run access checks**. Selecting a user alone does not run access checks.
3. Review the three layers: object read/edit, field read/edit and record read/edit. For example, object and record edit can be allowed while field edit is not allowed.
4. Inspect configured permission sources and open the relevant user, object or permission configuration in Salesforce Setup.
5. Rerun after a configuration change. Use **Open check query** to prepare the exact check in SOQL Explorer with the appropriate API mode, or **Export access evidence** to save a Markdown note.

Object and field observations come from Tooling API queries filtered to the selected user. Record observations come from UserRecordAccess. A failed query, an empty result, a mismatched user, or a missing permission value remains **Unavailable / Unknown**. A field omitted from the connected user's schema is not treated as a denial for the target user. No selected field is **Not checked**.

Configured sources cover the profile and active direct permission-set assignments, with matching object/field grants. Assigned groups are listed for inspection; their components and muting are not resolved into granting sources. Session activation and licenses also require separate inspection. These configured-source rows do not replace the per-user API observations.

Restriction rules, page layouts, Dynamic Forms, record types, validation rules, automation and the target user's active session remain unexamined. The results do not certify that an edit will succeed in a particular page or session. Inactive users are identified separately. Unsupported APIs and insufficient inspector permissions remain visible as unavailable checks.

Checks use read-only API calls. Evidence notes include org, connected and target user, record/field, timestamps, queries, configured sources and coverage. They omit credentials and record field values. Changing org, user or scope clears previous results; late responses cannot replace the new investigation.

## Compare profiles and permission sets

Choose **Compare profiles and permission sets** to open the existing report workspace. Metadata collection starts when you open this workflow. Use the report selector and filters to inspect configured object, field, general, Apex and page permissions. Export the report to CSV or PDF or use the similarity/difference filter.

A comparison describes the selected configurations. It does not establish a particular user's effective access, which can also depend on assignments, groups and muting, licenses, record sharing and session context.

## Related tools

- [Record Viewer](./record-viewer) — inspect the affected record and its field values
- [SOQL Explorer](./soql-explorer) — reproduce an individual check
- [SObject Explorer](./sobject-explorer) — inspect object-wide configuration and Blueprint evidence
