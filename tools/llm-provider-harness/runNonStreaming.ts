import { runHarness } from './runner.ts';

runHarness('non-streaming').catch(error => {
    console.error('[harness] fatal error:', error);
    process.exit(1);
});
