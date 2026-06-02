import { getField, getFlattenedFields } from '@jetstreamapp/soql-parser-js';

export const INITIAL_QUERY = {
    fields: [getField('Id')],
    sObject: undefined,
};

function stripManagedNamespace(segment) {
    const firstSeparator = segment.indexOf('__');
    if (firstSeparator === -1) return segment;
    const secondSeparator = segment.indexOf('__', firstSeparator + 2);
    if (secondSeparator === -1) return segment;
    return segment.slice(firstSeparator + 2);
}

function getRawFieldName(fieldName, relationships) {
    if (relationships) {
        return `${relationships}.${fieldName}`;
    }
    return fieldName;
}

function normalizeApiPathForComparison(value) {
    if (!value) return value;
    return String(value)
        .split('.')
        .map(segment => stripManagedNamespace(segment))
        .join('.');
}

function getComparisonFieldNames(query) {
    return getFlattenedFields(query).map(field => normalizeApiPathForComparison(field));
}

function toggleRootField(q, fieldName, relationships) {
    const fieldNames = getComparisonFieldNames(q);
    const rawFieldName = normalizeApiPathForComparison(getRawFieldName(fieldName, relationships));
    if (fieldNames.includes(rawFieldName)) {
        return {
            ...q,
            fields: q.fields.filter(field => {
                const relationshipPath = field.relationships && field.relationships.join('.');
                return (
                    normalizeApiPathForComparison(
                        getRawFieldName(field.field, relationshipPath)
                    ) !== rawFieldName
                );
            }),
        };
    }
    if (relationships) {
        return {
            ...q,
            fields: [
                ...q.fields,
                getField({
                    field: fieldName,
                    relationships: relationships.split('.'),
                }),
            ],
        };
    }
    return {
        ...q,
        fields: [...q.fields, getField(fieldName)],
    };
}

function toggleChildRelationshipField(state, fieldName, relationships, childRelationship) {
    const normalizedChildRelationship = normalizeApiPathForComparison(childRelationship);
    const childField = state.fields.find(
        field =>
            field.subquery &&
            normalizeApiPathForComparison(field.subquery.relationshipName) ===
                normalizedChildRelationship
    );
    if (!childField) {
        return {
            ...state,
            fields: [
                ...state.fields,
                getField({
                    subquery: {
                        fields: [getField(fieldName)],
                        relationshipName: childRelationship,
                    },
                }),
            ],
        };
    }
    const newSubquery = toggleRootField(childField.subquery, fieldName, relationships);
    const newFields = state.fields.map(field => {
        if (
            field.subquery &&
            normalizeApiPathForComparison(field.subquery.relationshipName) ===
                normalizedChildRelationship
        ) {
            return {
                ...field,
                subquery: newSubquery,
            };
        }
        return field;
    });
    return {
        ...state,
        fields: newFields,
    };
}

export function toggleField(state = INITIAL_QUERY, action) {
    const { fieldName, relationships, childRelationship } = action.payload;
    if (childRelationship) {
        return toggleChildRelationshipField(state, fieldName, relationships, childRelationship);
    }
    return toggleRootField(state, fieldName, relationships);
}

export function toggleRelationship(state = INITIAL_QUERY, action) {
    const { relationshipName } = action.payload;
    const normalizedRelationship = normalizeApiPathForComparison(relationshipName);
    const fieldNames = getComparisonFieldNames(state);
    if (fieldNames.includes(normalizedRelationship)) {
        return {
            ...state,
            fields: state.fields.filter(
                field =>
                    !field.subquery ||
                    normalizeApiPathForComparison(field.subquery.relationshipName) !==
                        normalizedRelationship
            ),
        };
    }
    const subquery = {
        fields: [getField('Id')],
        relationshipName,
    };
    return {
        ...state,
        fields: [...state.fields, getField({ subquery })],
    };
}

export function selectAllFields(q = INITIAL_QUERY, action) {
    const { sObjectMeta } = action.payload;
    return {
        ...q,
        fields: sObjectMeta.fields.map(field => getField(field.name)),
    };
}

export function clearAllFields(q = INITIAL_QUERY) {
    return {
        ...q,
        fields: [getField('Id')],
    };
}

export function selectSObject(sObjectName) {
    return {
        ...INITIAL_QUERY,
        sObject: sObjectName,
    };
}
