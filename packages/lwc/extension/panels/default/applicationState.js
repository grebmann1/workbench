const APPLICATIONS = {
    CONNECTION: 'connection',
    DOCUMENTATION: 'documentation',
    ASSISTANT: 'assistant',
    AGENT: 'agent',
    SMARTINPUT: 'smartinput',
};

function normalizeApplicationName(value, betaSmartInputEnabled = false) {
    let nextApplication =
        typeof value === 'string' && value.trim() ? value.trim() : APPLICATIONS.CONNECTION;

    if (nextApplication === 'home') {
        nextApplication = APPLICATIONS.CONNECTION;
    }
    if (!Object.values(APPLICATIONS).includes(nextApplication)) {
        nextApplication = APPLICATIONS.CONNECTION;
    }
    if (nextApplication === APPLICATIONS.SMARTINPUT && !betaSmartInputEnabled) {
        nextApplication = APPLICATIONS.CONNECTION;
    }
    return nextApplication;
}

module.exports = {
    APPLICATIONS,
    normalizeApplicationName,
};
