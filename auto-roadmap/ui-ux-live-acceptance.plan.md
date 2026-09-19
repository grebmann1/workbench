# UI/UX remaining live acceptance

The implementation and local checks are complete. Evidence:
[implementation report](../.zcc/library/findings/ui-ux-implementation.md).
These checks remain because no designated Salesforce test org or runnable hosted
shell was available during execution. This is not a new feature roadmap.

1. Use a designated test-org alias and representative data. Exercise saved-org,
   browser-session and OAuth connections on their supported targets. Verify
   production/sandbox/My Domain selection, cancellation, expired sessions,
   connection failure and retry.
2. Start each Home task while disconnected and confirm successful login resumes
   SOQL, SObject Explorer or Anonymous Apex. Run a read-only query, inspect an
   object and open the Apex editor. Verify task cancellation and navigation away
   prevent later redirects. Record errors without losing the user's draft.
3. Confirm an explicit Electron org launch takes precedence over any old Home
   task, using an actual saved test org. Verify reload on the resulting /app route.
4. Establish whether the hosted LWC shell is still a supported target. The current
   development server serves an API and redirects its root to the extension; the
   lwr.config.json referenced in the repository guidance is absent. If supported, supply its current entry
   point and run shell/home/navigation, offline tools and connection-callback
   checks, with browser-only UI absent.
5. Record actual outcomes and target/version details in the implementation report.
   Use isolated fixtures or a documented manual pass; the missing live-test
   fixture directory must not produce a false green result. Keep credentials out
   of reports and captures. Remove this plan after these checks are complete or
   the corresponding target is explicitly retired from scope.
