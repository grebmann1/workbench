# Access Analyzer

Investigate a selected user's object, field and record access, or compare configured profile and permission-set permissions.

Open **Admin → Access Analyzer** and enter the object, record and optional field to investigate. User investigations run read-only checks on request, preserve the record context, expose unavailable evidence, link to Setup and export a Markdown note. The report workflow remains available through **Compare profiles and permission sets**.

Object/field observations use UserEntityAccess and UserFieldAccess; record observations use UserRecordAccess. Configured-source inspection covers profiles and active direct permission-set assignments. Group/muting contributions, licenses, target-session activation, restriction rules and UI behavior remain unexamined. Missing evidence is never interpreted as a denial or a successful access check.

See [the user guide](../../../../apps/docs/docs/applications/access-analyzer.md) for scope and usage.
