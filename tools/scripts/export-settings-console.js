/**
 * SF Toolkit – Manual Settings Export Script
 *
 * Run this snippet in the browser DevTools console while the OLD version of SF Toolkit
 * is open (web app or extension popup).  It reads every key from localStorage and
 * downloads the result as a JSON file.
 *
 * Once you have the file, import it in the NEW version via:
 *   Settings → Storage → Cache → Import
 *
 * Usage:
 *   1. Open the old SF Toolkit app in your browser.
 *   2. Open DevTools (F12 / Cmd+Option+I).
 *   3. Paste this entire script into the Console tab and press Enter.
 *   4. A JSON file will be downloaded automatically.
 */
(function exportSfToolkitSettings() {
    const data = {};

    // Read every key from localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const raw = localStorage.getItem(key);
        try {
            data[key] = JSON.parse(raw);
        } catch {
            data[key] = raw;
        }
    }

    const keyCount = Object.keys(data).length;
    if (keyCount === 0) {
        console.warn('[SF Toolkit] No settings found in localStorage.');
        return;
    }

    const filename = 'sf-toolkit-settings-' + new Date().toISOString().slice(0, 10) + '.json';
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 1000);

    console.log(
        '[SF Toolkit] Exported ' + keyCount + ' settings to "' + filename + '".\n' +
        'Import the file in the new app: Settings → Storage → Cache → Import.'
    );
})();
