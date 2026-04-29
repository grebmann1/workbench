import { test } from 'node:test';
import assert from 'node:assert/strict';

function installStubs() {
    (globalThis as any).window = {};
    const store: Record<string, string> = {};
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
function removeStubs() {
    delete (globalThis as any).window;
    delete (globalThis as any).localStorage;
}

test('backgroundJob: upsertJob inserts with normalised defaults', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        const s = r([] as any, reduxSlice.actions.upsertJob({ id: 'j1', label: 'Sync' }));
        assert.equal(s.length, 1);
        assert.equal(s[0].id, 'j1');
        assert.equal(s[0].label, 'Sync');
        assert.equal(s[0].status, 'idle');
        assert.ok(s[0].startedAt);
    } finally {
        removeStubs();
    }
});

test('backgroundJob: upsertJob merges onto existing id, preserves startedAt', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        let s = r([] as any, reduxSlice.actions.upsertJob({ id: 'j1', startedAt: 100 }));
        s = r(s, reduxSlice.actions.upsertJob({ id: 'j1', status: 'running' }));
        assert.equal(s.length, 1);
        assert.equal(s[0].status, 'running');
        assert.equal(s[0].startedAt, 100);
    } finally {
        removeStubs();
    }
});

test('backgroundJob: completeJob marks status=finished and sets endedAt', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        let s = r([] as any, reduxSlice.actions.upsertJob({ id: 'j1' }));
        s = r(s, reduxSlice.actions.completeJob({ id: 'j1' }));
        assert.equal(s[0].status, 'finished');
        assert.ok(s[0].endedAt);
    } finally {
        removeStubs();
    }
});

test('backgroundJob: failJob / cancelJob set terminal statuses', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        let s = r([] as any, reduxSlice.actions.upsertJob({ id: 'j1' }));
        s = r(s, reduxSlice.actions.failJob({ id: 'j1' }));
        assert.equal(s[0].status, 'error');
        s = r([] as any, reduxSlice.actions.upsertJob({ id: 'j2' }));
        s = r(s, reduxSlice.actions.cancelJob({ id: 'j2' }));
        assert.equal(s[0].status, 'cancelled');
    } finally {
        removeStubs();
    }
});

test('backgroundJob: clearJobs empties state; removeJob drops by id', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        let s = r([] as any, reduxSlice.actions.upsertJob({ id: 'j1' }));
        s = r(s, reduxSlice.actions.upsertJob({ id: 'j2' }));
        s = r(s, reduxSlice.actions.removeJob({ id: 'j1' }));
        assert.equal(s.length, 1);
        assert.equal(s[0].id, 'j2');
        s = r(s, reduxSlice.actions.clearJobs());
        assert.deepEqual(s, []);
    } finally {
        removeStubs();
    }
});

test('backgroundJob: normalises progress numeric fields', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        const s = r(
            [] as any,
            reduxSlice.actions.upsertJob({
                id: 'j1',
                progress: { completed: '5', total: 10, percent: '50' },
            })
        );
        assert.equal(s[0].progress.completed, 5);
        assert.equal(s[0].progress.total, 10);
        assert.equal(s[0].progress.percent, 50);
    } finally {
        removeStubs();
    }
});

test('backgroundJob: normalises actions array, drops non-objects', async () => {
    installStubs();
    try {
        const { reduxSlice } = await import('../backgroundJob.ts');
        const r = reduxSlice.reducer;
        const s = r(
            [] as any,
            reduxSlice.actions.upsertJob({
                id: 'j1',
                actions: [null, { kind: 'navigate', label: 'Go' }, 'bogus'],
            })
        );
        assert.equal(s[0].actions.length, 1);
        assert.equal(s[0].actions[0].kind, 'navigate');
    } finally {
        removeStubs();
    }
});
