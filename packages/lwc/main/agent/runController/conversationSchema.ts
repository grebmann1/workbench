export const CONVERSATION_SCHEMA_VERSION = 1;

/** Version zero was the unversioned conversation object shipped by earlier releases. */
export function migrateConversationData(raw: unknown): Record<string, unknown> {
    const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
    const version = value.schemaVersion ?? 0;
    if (version !== 0 && version !== CONVERSATION_SCHEMA_VERSION) {
        throw new Error(
            'Conversation data was saved by a newer Workbench version. Update Workbench before saving chats.'
        );
    }
    return { ...value, schemaVersion: CONVERSATION_SCHEMA_VERSION };
}
