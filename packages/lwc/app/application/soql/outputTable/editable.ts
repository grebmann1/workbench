import { lowerCaseKey } from 'shared/utils';

export type FieldEditorType =
    | 'text'
    | 'textarea'
    | 'number'
    | 'date'
    | 'datetime'
    | 'boolean'
    | 'picklist'
    | 'multipicklist';

export interface FieldEditability {
    editable: boolean;
    editorType?: FieldEditorType;
    rawType?: string;
    length?: number;
    picklistValues?: Array<{ label: string; value: string }>;
    label?: string;
    reason?: 'no-describe' | 'not-updateable' | 'dotted' | 'child-subquery' | 'not-found';
}

const NOT_EDITABLE: FieldEditability = { editable: false };

function soapTypeToEditor(type: string | undefined): FieldEditorType | undefined {
    switch ((type || '').toLowerCase()) {
        case 'string':
        case 'email':
        case 'phone':
        case 'url':
        case 'id':
        case 'reference':
        case 'encryptedstring':
            return 'text';
        case 'textarea':
            return 'textarea';
        case 'int':
        case 'double':
        case 'currency':
        case 'percent':
            return 'number';
        case 'date':
            return 'date';
        case 'datetime':
        case 'time':
            return 'datetime';
        case 'boolean':
            return 'boolean';
        case 'picklist':
            return 'picklist';
        case 'multipicklist':
            return 'multipicklist';
        default:
            return undefined;
    }
}

/**
 * Look up the describe-data.fields entry for a given sObjectType+field.
 * Supports the shape `state.sobject.entities[<lowerType>].data.fields`.
 */
export function findFieldDescribe(
    sobjectState: any,
    sobjectType: string | null | undefined,
    field: string
): any {
    if (!sobjectState || !sobjectType || !field) return null;
    const entities = sobjectState.entities || sobjectState;
    const entry = entities?.[lowerCaseKey(sobjectType)];
    const fields = entry?.data?.fields;
    if (!Array.isArray(fields)) return null;
    return fields.find(f => f?.name === field) || null;
}

/**
 * Resolve editability for a given cell:
 * - dotted columns (Account.Name) -> read-only (cannot PATCH via simple REST)
 * - object cell values (child subquery) -> read-only
 * - missing describe -> not editable for now (describe will be fetched lazily)
 * - field must be present and `updateable === true`
 */
export function resolveFieldEditability({
    sobjectState,
    sobjectType,
    field,
    value,
}: {
    sobjectState: any;
    sobjectType: string | null | undefined;
    field: string;
    value: any;
}): FieldEditability {
    if (!field) return NOT_EDITABLE;
    if (field.indexOf('.') >= 0) return { editable: false, reason: 'dotted' };
    if (value && typeof value === 'object') return { editable: false, reason: 'child-subquery' };
    if (!sobjectType) return { editable: false, reason: 'no-describe' };

    const describe = findFieldDescribe(sobjectState, sobjectType, field);
    if (!describe) return { editable: false, reason: 'not-found' };
    if (describe.updateable !== true) return { editable: false, reason: 'not-updateable' };

    const editorType = soapTypeToEditor(describe.type);
    if (!editorType) return { editable: false, reason: 'not-updateable' };

    return {
        editable: true,
        editorType,
        rawType: describe.type,
        length: describe.length,
        picklistValues: Array.isArray(describe.picklistValues)
            ? describe.picklistValues
                  .filter(pv => pv && pv.active !== false)
                  .map(pv => ({ label: pv.label || pv.value, value: pv.value }))
            : undefined,
        label: describe.label,
    };
}

/**
 * Normalize a value coming from an editor back into the shape Salesforce expects.
 * The cell editor emits strings/booleans/arrays; this function converts them to
 * the right JSON shape for jsforce's `.update()`.
 */
export function normalizeEditorValue(editorType: FieldEditorType | undefined, raw: any): any {
    if (raw === '' || raw === undefined) return null;
    if (raw === null) return null;
    switch (editorType) {
        case 'number': {
            const n = typeof raw === 'number' ? raw : Number(raw);
            return Number.isFinite(n) ? n : null;
        }
        case 'boolean':
            return raw === true || raw === 'true';
        case 'multipicklist':
            if (Array.isArray(raw)) return raw.join(';');
            return String(raw);
        default:
            return raw;
    }
}
