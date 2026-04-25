/**
 * Salesforce domain types shared across modules.
 */

/** Canonical shape of a Salesforce SOQL query response envelope. */
export type SalesforceQueryResponse<T = Record<string, unknown>> = {
    totalSize?: number;
    done?: boolean;
    records?: T[];
    nextRecordsUrl?: string;
    [key: string]: unknown;
};

/** Minimal shape of the userInfo object returned by jsforce/Salesforce identity. */
export type SalesforceUserInfo = {
    id?: string;
    organizationId?: string;
    url?: string;
    email?: string;
    display_name?: string;
    name?: string;
    [key: string]: unknown;
};

/** 15-char or 18-char Salesforce record ID. Runtime-validated by `isSalesforceId()`. */
export type SalesforceId = string;

/** Salesforce API version string (e.g. `"63.0"`). */
export type ApiVersion = string;
