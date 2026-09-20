import LightningModal from 'lightning/modal';
import { api } from 'lwc';
import { resolveLoginUrl } from './loginUrl';

export default class ConnectPrompt extends LightningModal {
    @api taskLabel = '';
    environment = 'production';
    customDomain = '';
    error = '';

    get heading() {
        return this.taskLabel ? `Connect to use ${this.taskLabel}` : 'Connect a Salesforce org';
    }
    get environments() {
        return [
            { label: 'Production', value: 'production' },
            { label: 'Sandbox', value: 'sandbox' },
            { label: 'My Domain', value: 'custom' },
        ];
    }
    get isCustom() {
        return this.environment === 'custom';
    }
    handleEnvironment = event => {
        this.environment = event.detail.value;
        this.error = '';
    };
    handleDomain = event => {
        this.customDomain = event.target.value;
        this.error = '';
    };
    handleConnect = () => {
        try {
            this.close({ loginUrl: resolveLoginUrl(this.environment, this.customDomain) });
        } catch (error) {
            this.error = error.message;
        }
    };
    handleSaved = () => {
        this.close({ manageConnections: true });
    };
    handleCancel = () => {
        this.close();
    };
}
