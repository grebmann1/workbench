export const buildApplicationRedirectUrl = applicationName => {
    const params = new URLSearchParams({ applicationName });
    return encodeURIComponent(params.toString());
};
