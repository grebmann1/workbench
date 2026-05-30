// recordviewerCommands.ts
// Module: applications/recordviewer/app/recordviewerCommands
//
// N9a — cross-app entry point for recordviewer. Lives in its own file so
// tests can import it without dragging the LWC component module (which
// transitively imports `lightning/toast`, `lwr/navigation`, `lwc`, etc.
// — all of which are runtime-resolved by LWR and unavailable to
// `node --test`).
//
// Architectural notes:
//  - Registration runs at module-eval time via {@link registerRecordViewerCommands}.
//    The component bootstrap calls this function once on first import, so
//    the command exists before any LWC instance mounts. Idempotent —
//    re-calling is a no-op.
//  - The handler validates the recordId shape via {@link asSalesforceId}
//    and silently rejects invalid payloads (returns `undefined`). This
//    matches the typed contract `CommandPayloads['recordviewer.open']:
//    { recordId: string }` declared in `host-api/commands`.

import { registerCommand } from 'host-api/commands';
import { asSalesforceId } from 'shared/soqlQuery/soqlQuery';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';

/**
 * Best-effort Salesforce ID validator. Returns the input if valid, else
 * null. `asSalesforceId` throws on invalid input — we swallow the throw
 * at the command boundary so a malformed payload does not crash the host.
 */
function safeRecordId(value: string | undefined): string | null {
    if (!value) return null;
    try {
        return asSalesforceId(value);
    } catch {
        return null;
    }
}

let _commandsRegistered = false;

/**
 * Register the `recordviewer.open` cross-app command. Idempotent —
 * the second call is a no-op even though `registerCommand` itself
 * tolerates re-registration.
 */
export function registerRecordViewerCommands(): void {
    if (_commandsRegistered) return;
    _commandsRegistered = true;

    registerCommand('recordviewer.open', ({ recordId }) => {
        const validId = safeRecordId(recordId);
        if (!validId) return;
        const target = `sftoolkit:${JSON.stringify({
            type: 'application',
            state: { applicationName: 'recordviewer', recordId: validId },
        })}`;
        return legacyStore.dispatch(legacyStore_application.navigate(target));
    });
}

/**
 * Test-only: drop the registered flag so a subsequent
 * `registerRecordViewerCommands` call re-runs the registration. Not part
 * of the public surface — keep usage to `__tests__/`.
 */
export function __resetRecordViewerCommandsForTests(): void {
    _commandsRegistered = false;
}
