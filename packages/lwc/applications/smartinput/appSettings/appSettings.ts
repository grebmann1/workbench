import AppSettingsElement from 'host-api/settingsElement';

export default class SmartinputAppSettings extends AppSettingsElement {
    get isBetaEnabled() {
        return !!this.getConfigValue('beta_smartinput_enabled', false);
    }

    get isQuickPickEnabled() {
        return !!this.getConfigValue('input_quickpick_enabled', false);
    }
}
