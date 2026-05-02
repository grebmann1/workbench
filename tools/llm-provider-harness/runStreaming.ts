import { runHarness } from './runner.ts';

runHarness('streaming').catch(error => {
    console.error('[harness] fatal error:', error);
    process.exit(1);
});
