import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadTypeScriptModule } from '../../../../../../../tools/testing/loadTypeScriptModule.mjs';

function fixture() {
    const focus = [];
    const { default: Footer } = loadTypeScriptModule(new URL('../footer.ts', import.meta.url), {
        'core/store': {},
        'extension/utils': {},
        'lightning/toast': {},
        lwc: {
            LightningElement: class {},
            api() {},
            wire: () => () => undefined,
        },
        moment: {},
        'shared/utils': {},
    });
    const footer = new Footer();
    footer.template = { querySelector: selector => ({ focus: () => focus.push(selector) }) };
    return { footer, focus };
}

for (const kind of ['Error', 'Job']) {
    test(`${kind} panel dismissal restores focus and preserves logged entries`, () => {
        const { footer, focus } = fixture();
        const errors = [{ id: 'error-1', message: 'Metadata unavailable' }];
        const jobs = [{ id: 'job-1', label: 'Retrieve', status: 'running' }];
        footer.applicationChange({ application: {}, errors, backgroundJobs: jobs });
        footer[`handle${kind}Click`]();
        footer.renderedCallback();
        assert.equal(focus[0], `.footer-${kind.toLowerCase()}-panel-close`);
        let prevented = false;
        let stopped = false;
        footer.handlePanelKeydown({
            key: 'Escape',
            preventDefault: () => (prevented = true),
            stopPropagation: () => (stopped = true),
        });
        assert.equal(prevented, true);
        assert.equal(stopped, true);
        assert.equal(footer.isErrorPanelOpen, false);
        assert.equal(footer.isJobPanelOpen, false);
        assert.equal(focus.at(-1), `.footer-${kind.toLowerCase()}-message`);
        assert.equal(footer.errors, errors);
        assert.equal(footer.jobs, jobs);
        footer.applicationChange({
            application: {},
            errors: [...errors, { id: 'error-2', message: 'A later error' }],
        });
        assert.equal(footer.isErrorPanelOpen, false);
        assert.equal(footer.isJobPanelOpen, false);
    });
}
