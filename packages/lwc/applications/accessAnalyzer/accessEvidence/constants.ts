export const API_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const USER_SEARCH_LIMIT = 20;
export const SOURCE_LIMIT = 100;
export const COVERAGE = [
    'Object, field and record results are separate Salesforce API observations for the selected user.',
    'Restriction rules, page layouts, Dynamic Forms, record types, validation rules, automation and the target user’s active session have not been evaluated.',
    'Configured sources cover the profile and active direct permission-set assignments. Permission-set groups, muting, licenses and session activation are not resolved into granting sources.',
];
