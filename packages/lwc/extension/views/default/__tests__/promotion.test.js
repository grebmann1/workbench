import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTypeScriptModule } from '../../../../../../tools/testing/loadTypeScriptModule.mjs';
import { ZANA_PROMOTION_ID } from '../constants.ts';

function panel({ read = async () => false, save = async () => {} } = {}) {
    const { default: Default } = loadTypeScriptModule(new URL('../default.ts', import.meta.url), {
        'core/store': {},
        'core/announcements': {
            isAnnouncementDismissed: read,
            markAnnouncementDismissed: save,
        },
        '../../../main/agent/utils/oauthPersist': {},
        'extension/utils': { PANELS: { DEFAULT: 'default', SALESFORCE: 'salesforce' } },
        lwc: { LightningElement: class {}, api: () => {}, wire: () => () => {} },
        'shared/cacheManager': {},
        'shared/llm': {},
        'shared/logger': {},
        'shared/store': {},
        'shared/utils': {},
        './constants': { ZANA_PROMOTION_ID },
    });
    return new Default();
}

test('promotion stays hidden until the saved dismissal preference is known', async () => {
    const app = panel();
    assert.equal(app.showZanaPromotion, false);
    await app.loadZanaPromotion();
    assert.equal(app.showZanaPromotion, true);
});

test('closing hides immediately and persists dismissal across panel instances', async () => {
    const dismissed = new Set();
    let finishSave;
    const saving = new Promise(resolve => {
        finishSave = resolve;
    });
    const storage = {
        read: async id => dismissed.has(id),
        save: async id => {
            await saving;
            dismissed.add(id);
        },
    };
    const app = panel(storage);
    await app.loadZanaPromotion();
    const closing = app.handleDismissZanaPromotion();
    assert.equal(app.showZanaPromotion, false);
    finishSave();
    await closing;
    assert.equal(dismissed.has(ZANA_PROMOTION_ID), true);
    const reopened = panel(storage);
    await reopened.loadZanaPromotion();
    assert.equal(reopened.showZanaPromotion, false);
});

test('a pending preference read cannot make a closed promotion reappear', async () => {
    let finishRead;
    const reading = new Promise(resolve => {
        finishRead = resolve;
    });
    const app = panel({ read: () => reading });
    const loading = app.loadZanaPromotion();
    await app.handleDismissZanaPromotion();
    finishRead(false);
    await loading;
    assert.equal(app.showZanaPromotion, false);
});

test('unavailable preference storage keeps the promotion hidden without blocking the panel', async () => {
    const app = panel({
        read: async () => {
            throw new Error('Storage unavailable');
        },
    });
    await app.loadZanaPromotion();
    assert.equal(app.showZanaPromotion, false);
});

test('a failed save still lets the user close the promotion for this panel', async () => {
    const app = panel({
        save: async () => {
            throw new Error('Storage unavailable');
        },
    });
    await app.loadZanaPromotion();
    await app.handleDismissZanaPromotion();
    await app.loadZanaPromotion();
    assert.equal(app.showZanaPromotion, false);
});
