import assert from 'node:assert/strict';
import { test } from 'node:test';

function installLocalStorage() {
    const store: Record<string, string> = {};
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
            store[k] = String(v);
        },
        removeItem: (k: string) => {
            delete store[k];
        },
    };
    return store;
}
function removeLocalStorage() {
    delete (globalThis as any).localStorage;
    delete (globalThis as any).window;
}

test('document/apexFile: upsertOne stores formatted data and persists', async () => {
    const store = installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.APEXFILE.reducer;
        const s = r(
            undefined,
            reduxSlices.APEXFILE.actions.upsertOne({
                id: 'ClassA',
                content: 'System.debug(1);',
                isGlobal: false,
                alias: 'prod',
            })
        );
        assert.equal(s.ids.length, 1);
        const first: any = s.entities[s.ids[0]];
        assert.equal(first.id, 'classa');
        assert.equal(first.alias, 'prod');
        assert.ok(store['APEXFILES']);
    } finally {
        removeLocalStorage();
    }
});

test('document/apexFile: upsertOne with isGlobal=true nulls alias', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.APEXFILE.reducer;
        const s = r(
            undefined,
            reduxSlices.APEXFILE.actions.upsertOne({
                id: 'Global',
                isGlobal: true,
                alias: 'ignored',
            })
        );
        const first: any = s.entities[s.ids[0]];
        assert.equal(first.alias, null);
        assert.equal(first.isGlobal, true);
    } finally {
        removeLocalStorage();
    }
});

test('document/apexFile: upsertOne throws when required fields missing', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.APEXFILE.reducer;
        assert.throws(
            () => r(undefined, reduxSlices.APEXFILE.actions.upsertOne({ content: 'x' } as any)),
            /Required data missing/
        );
    } finally {
        removeLocalStorage();
    }
});

test('document/apexFile: removeOne drops by id', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.APEXFILE.reducer;
        let s = r(
            undefined,
            reduxSlices.APEXFILE.actions.upsertOne({
                id: 'C1',
                isGlobal: true,
            })
        );
        s = r(s, reduxSlices.APEXFILE.actions.removeOne('c1'));
        assert.equal(s.ids.length, 0);
    } finally {
        removeLocalStorage();
    }
});

test('document/queryFile: upsertOne roundtrips through formatData', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.QUERYFILE.reducer;
        const s = r(
            undefined,
            reduxSlices.QUERYFILE.actions.upsertOne({
                id: 'Q1',
                content: 'SELECT Id FROM Account',
                isGlobal: true,
            })
        );
        const first: any = s.entities[s.ids[0]];
        assert.equal(first.id, 'q1');
        assert.equal(first.content, 'SELECT Id FROM Account');
    } finally {
        removeLocalStorage();
    }
});

test('document/apexFile: loadFromStorage hydrates from localStorage JSON', async () => {
    const store = installLocalStorage();
    store['APEXFILES'] = JSON.stringify([{ id: 'x', isGlobal: true, alias: null, content: 'y' }]);
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.APEXFILE.reducer;
        const s = r(undefined, reduxSlices.APEXFILE.actions.loadFromStorage({}));
        assert.equal(s.ids.length, 1);
    } finally {
        removeLocalStorage();
    }
});

test('document/recent: saveQuery dedups and caps at MAX_RECENT', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.RECENT.reducer;
        let s = r(
            undefined,
            reduxSlices.RECENT.actions.saveQuery({
                soql: 'SELECT Id FROM A',
                alias: 'prod',
            })
        );
        s = r(s, reduxSlices.RECENT.actions.saveQuery({ soql: 'SELECT Id FROM B', alias: 'prod' }));
        s = r(s, reduxSlices.RECENT.actions.saveQuery({ soql: 'SELECT Id FROM A', alias: 'prod' }));
        assert.equal(s.queries.length, 2);
        assert.equal(s.queries[0], 'SELECT Id FROM A');
        assert.equal(s.queries[1], 'SELECT Id FROM B');
    } finally {
        removeLocalStorage();
    }
});

test('document/recent: saveApi dedups by method+endpoint tuple', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.RECENT.reducer;
        let s = r(
            undefined,
            reduxSlices.RECENT.actions.saveApi({
                item: { method: 'GET', endpoint: '/a' },
                alias: 'prod',
            })
        );
        s = r(
            s,
            reduxSlices.RECENT.actions.saveApi({
                item: { method: 'POST', endpoint: '/a' },
                alias: 'prod',
            })
        );
        s = r(
            s,
            reduxSlices.RECENT.actions.saveApi({
                item: { method: 'GET', endpoint: '/a' },
                alias: 'prod',
            })
        );
        assert.equal(s.api.length, 2);
        assert.equal(s.api[0].method, 'GET');
    } finally {
        removeLocalStorage();
    }
});

test('document/recent: saveRecordViewers dedups by recordId', async () => {
    installLocalStorage();
    try {
        const { reduxSlices } = await import('../document.ts');
        const r = reduxSlices.RECENT.reducer;
        let s = r(
            undefined,
            reduxSlices.RECENT.actions.saveRecordViewers({
                item: { recordId: '001', name: 'Acme' },
                alias: 'prod',
            })
        );
        s = r(
            s,
            reduxSlices.RECENT.actions.saveRecordViewers({
                item: { recordId: '001', name: 'Acme renamed' },
                alias: 'prod',
            })
        );
        assert.equal(s.recordViewers.length, 1);
        assert.equal(s.recordViewers[0].name, 'Acme renamed');
    } finally {
        removeLocalStorage();
    }
});
