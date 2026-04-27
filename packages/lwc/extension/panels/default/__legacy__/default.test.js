/* eslint-env jest */
const applicationStateModule = require('../applicationState.js');

describe('default side panel application restore', () => {
    it('restores the agent application from cached state', () => {
        expect(
            applicationStateModule.normalizeApplicationName(
                applicationStateModule.APPLICATIONS.AGENT
            )
        ).toBe(applicationStateModule.APPLICATIONS.AGENT);
    });

    it('falls back to connection when the cached value is invalid', () => {
        expect(applicationStateModule.normalizeApplicationName('unknown-app')).toBe(
            applicationStateModule.APPLICATIONS.CONNECTION
        );
        expect(applicationStateModule.normalizeApplicationName(null)).toBe(
            applicationStateModule.APPLICATIONS.CONNECTION
        );
    });

    it('gates smart input behind the beta flag', () => {
        expect(
            applicationStateModule.normalizeApplicationName(
                applicationStateModule.APPLICATIONS.SMARTINPUT,
                false
            )
        ).toBe(applicationStateModule.APPLICATIONS.CONNECTION);
        expect(
            applicationStateModule.normalizeApplicationName(
                applicationStateModule.APPLICATIONS.SMARTINPUT,
                true
            )
        ).toBe(applicationStateModule.APPLICATIONS.SMARTINPUT);
    });
});
