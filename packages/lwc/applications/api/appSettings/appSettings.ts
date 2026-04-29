import AppSettingsElement from 'host-api/settingsElement';

export default class ApiAppSettings extends AppSettingsElement {
    get isSplitterHorizontal() {
        return !!(this.config && this.config.api_splitter_is_horizontal);
    }
}
