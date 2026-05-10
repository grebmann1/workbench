import { registerCommand } from 'host-api/commands';
import ToolkitElement from 'host-api/element';
import { store as legacyStore, store_application as legacyStore_application } from 'shared/store';
import { track } from 'lwc';

type Tab = 'inspector' | 'editor';

let _agentforceBootstrapped = false;
function bootstrapAgentforceExtension() {
    if (_agentforceBootstrapped) return;
    _agentforceBootstrapped = true;

    registerCommand('agentforce.open', () => {
        const target = `sftoolkit:${JSON.stringify({
            type: 'application',
            state: { applicationName: 'agentforce' },
        })}`;
        return legacyStore.dispatch(legacyStore_application.navigate(target));
    });
}
bootstrapAgentforceExtension();

export default class App extends ToolkitElement {
    @track activeTab: Tab = 'inspector';

    get isInspectorActive(): boolean {
        return this.activeTab === 'inspector';
    }

    get isEditorActive(): boolean {
        return this.activeTab === 'editor';
    }

    handleSelectInspector = (): void => {
        this.activeTab = 'inspector';
    };

    handleSelectEditor = (): void => {
        this.activeTab = 'editor';
    };
}
