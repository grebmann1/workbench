import { LightningElement, api } from 'lwc';
import type { AuthProfile } from 'api/slices/apiAuthProfiles';

/**
 * Presentational dropdown for picking an auth profile for the active tab.
 * Owned state lives in the parent (app.ts) + Redux. This component just
 * renders the available profiles and emits `profilechange` when the user
 * picks one.
 */
export default class AuthProfileSelector extends LightningElement {
    @api profiles: AuthProfile[] = [];
    @api selectedId: string | null = null;

    handleChange(e: CustomEvent) {
        const value = (e.currentTarget as any).value;
        this.dispatchEvent(
            new CustomEvent('profilechange', {
                detail: { id: value },
                bubbles: true,
                composed: true,
            })
        );
    }

    get options() {
        return (this.profiles || []).map(p => ({
            label: p.name,
            value: p.id,
        }));
    }

    get currentValue(): string {
        return this.selectedId || 'inherit';
    }
}
