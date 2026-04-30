export const EMPLOYEE_LLM_KEY_PATTERN = '^sk-[A-Za-z0-9_\\-]+$';
export const EMPLOYEE_LLM_KEY_PATTERN_MESSAGE =
    'Key must start with sk- and contain only letters, numbers, underscores, and hyphens.';

const EMPLOYEE_LLM_KEY_REGEX = new RegExp(EMPLOYEE_LLM_KEY_PATTERN);

export function isEmployeeLlmKeyValid(value) {
    return EMPLOYEE_LLM_KEY_REGEX.test(value);
}
