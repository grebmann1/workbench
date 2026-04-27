import Toast from 'lightning/toast';
import { LightningElement } from 'lwc';

export default class MarkdowView extends LightningElement {
    body = 'Hello the world';

    /** Methods **/

    getDocumentId = () => {
        return new URLSearchParams(window.location.search).get('documentId');
    };

    sendError = () => {
        Toast.show({
            label: 'Session Error',
            message: 'Invalid Session',
            variant: 'error',
            mode: 'dismissible',
        });
    };
}
