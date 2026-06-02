export async function handleLaunchWebAuthFlow(message) {
    const responseUrl = await chrome.identity.launchWebAuthFlow({
        url: message.url,
        interactive: true,
    });
    if (chrome.runtime.lastError) {
        return { error: chrome.runtime.lastError.message };
    }
    if (!responseUrl) {
        return { error: 'OAuth flow canceled' };
    }

    const url = new URL(responseUrl);
    const searchParams = new URLSearchParams(url.search);
    const hashParams = new URLSearchParams(
        url.hash && url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    );
    const code = searchParams.get('code') || hashParams.get('code');
    const error = searchParams.get('error') || hashParams.get('error');
    const errorDescription =
        searchParams.get('error_description') || hashParams.get('error_description');
    return { code, error, errorDescription, responseUrl };
}
