import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeCommandAvailability } from './desktopPrerequisites';

test('summarizeCommandAvailability reports missing public desktop prerequisites', () => {
    assert.deepEqual(
        summarizeCommandAvailability({
            java: false,
            pmd: false,
            sfdx: true,
            vscode: false,
        }),
        {
            missing: ['java', 'pmd', 'vscode'],
            messages: [
                'Install Java to run PMD-based Apex analysis.',
                'Install PMD or use the desktop installer flow before running code analysis.',
                'Install Visual Studio Code or the code command to open retrieved workspaces.',
            ],
            ready: false,
        }
    );
});

test('summarizeCommandAvailability marks the desktop prerequisites as ready when all commands exist', () => {
    assert.deepEqual(
        summarizeCommandAvailability({
            java: true,
            pmd: true,
            sfdx: true,
            vscode: true,
        }),
        {
            missing: [],
            messages: [],
            ready: true,
        }
    );
});
