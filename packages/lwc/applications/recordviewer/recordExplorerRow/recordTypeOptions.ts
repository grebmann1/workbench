type RecordTypeInfo = {
    active?: boolean;
    available?: boolean;
    developerName?: string;
    name?: string;
    recordTypeId?: string;
};

type PicklistOption = {
    label: string;
    value: string;
};

export const RECORD_TYPE_FIELD_NAME = 'RecordTypeId';

export function isRecordTypeField(fieldName: string | null | undefined) {
    return fieldName === RECORD_TYPE_FIELD_NAME;
}

function isSelectableRecordType(recordType: RecordTypeInfo, currentRecordTypeId?: string | null) {
    if (recordType.recordTypeId === currentRecordTypeId) {
        return true;
    }
    return recordType.active !== false && recordType.available !== false;
}

function getRecordTypeLabel(recordType: RecordTypeInfo) {
    return recordType.name || recordType.developerName || recordType.recordTypeId || '';
}

export function buildRecordTypePicklistOptions(
    recordTypeInfos: RecordTypeInfo[] | null | undefined,
    currentRecordTypeId?: string | null
): PicklistOption[] {
    if (!Array.isArray(recordTypeInfos)) {
        return [];
    }

    return recordTypeInfos
        .filter(recordType => recordType.recordTypeId)
        .filter(recordType => isSelectableRecordType(recordType, currentRecordTypeId))
        .map(recordType => ({
            label: getRecordTypeLabel(recordType),
            value: recordType.recordTypeId as string,
        }));
}

export function getRecordTypeEditorField<Field extends { name?: string; type?: string }>(
    uiField: Field
): Field {
    if (!isRecordTypeField(uiField?.name)) {
        return uiField;
    }
    return {
        ...uiField,
        type: 'picklist',
    };
}

export function buildRecordTypePicklistValues(
    recordTypeInfos: RecordTypeInfo[] | null | undefined,
    currentRecordTypeId?: string | null
): Record<string, PicklistOption[]> {
    return {
        [RECORD_TYPE_FIELD_NAME]: buildRecordTypePicklistOptions(
            recordTypeInfos,
            currentRecordTypeId
        ),
    };
}
