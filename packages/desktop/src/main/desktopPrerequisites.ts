export type DesktopCommandAvailability = {
    java: boolean;
    pmd: boolean;
    sfdx: boolean;
    vscode: boolean;
};

export type DesktopPrerequisiteSummary = {
    missing: Array<keyof DesktopCommandAvailability>;
    messages: string[];
    ready: boolean;
};

const MISSING_MESSAGES: Record<keyof DesktopCommandAvailability, string> = {
    java: 'Install Java to run PMD-based Apex analysis.',
    pmd: 'Install PMD or use the desktop installer flow before running code analysis.',
    sfdx: 'Install the Salesforce CLI and authenticate at least one org.',
    vscode: 'Install Visual Studio Code or the code command to open retrieved workspaces.',
};

export function summarizeCommandAvailability(
    availability: DesktopCommandAvailability
): DesktopPrerequisiteSummary {
    const missing = (
        Object.keys(MISSING_MESSAGES) as Array<keyof DesktopCommandAvailability>
    ).filter(key => !availability[key]);

    return {
        missing,
        messages: missing.map(key => MISSING_MESSAGES[key]),
        ready: missing.length === 0,
    };
}
