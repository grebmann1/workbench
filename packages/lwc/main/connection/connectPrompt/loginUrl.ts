export function resolveLoginUrl(environment: string, domain: string): string {
    if (environment === 'production') return 'https://login.salesforce.com';
    if (environment === 'sandbox') return 'https://test.salesforce.com';
    if (environment === 'custom') {
        try {
            const url = new URL(domain.trim());
            if (
                url.protocol === 'https:' &&
                url.hostname.endsWith('.salesforce.com') &&
                !url.username &&
                !url.password &&
                !url.port &&
                url.pathname === '/' &&
                !url.search &&
                !url.hash
            )
                return url.origin;
        } catch {
            /* The message below explains the expected input. */
        }
    }
    throw new Error(
        'Enter a Salesforce My Domain URL, such as https://your-org.my.salesforce.com.'
    );
}
