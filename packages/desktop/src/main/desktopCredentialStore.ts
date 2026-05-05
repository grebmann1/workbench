export type SecretCipher = {
    decryptString(buffer: Buffer): string;
    encryptString(value: string): Buffer;
    isEncryptionAvailable(): boolean;
};

export type StoredSecret = {
    encoding: 'safeStorage';
    value: string;
};

export type OrgSecrets = Record<string, string>;
export type EncryptedOrgSecrets = Record<string, StoredSecret>;

const SECRET_FIELD_NAMES = new Set(['accessToken', 'refreshToken', 'sessionId', 'sfdxAuthUrl']);

function isSecretField(fieldName: string, value: unknown): value is string {
    return SECRET_FIELD_NAMES.has(fieldName) && typeof value === 'string' && value.length > 0;
}

export function splitOrgSecrets(configuration: Record<string, any> = {}): {
    publicConfiguration: Record<string, any>;
    secrets: OrgSecrets;
} {
    const publicConfiguration: Record<string, any> = {};
    const secrets: OrgSecrets = {};

    for (const [key, value] of Object.entries(configuration)) {
        if (isSecretField(key, value)) {
            secrets[key] = value;
        } else {
            publicConfiguration[key] = value;
        }
    }

    return { publicConfiguration, secrets };
}

export function encryptStoredSecret(value: string, cipher: SecretCipher): StoredSecret {
    if (!cipher.isEncryptionAvailable()) {
        throw new Error('OS credential encryption is unavailable on this device.');
    }

    return {
        encoding: 'safeStorage',
        value: cipher.encryptString(value).toString('base64'),
    };
}

export function decryptStoredSecret(secret: StoredSecret, cipher: SecretCipher): string {
    if (secret.encoding !== 'safeStorage') {
        throw new Error(`Unsupported desktop secret encoding: ${secret.encoding}`);
    }

    if (!cipher.isEncryptionAvailable()) {
        throw new Error('OS credential encryption is unavailable on this device.');
    }

    return cipher.decryptString(Buffer.from(secret.value, 'base64'));
}

export function encryptOrgSecrets(secrets: OrgSecrets, cipher: SecretCipher): EncryptedOrgSecrets {
    return Object.fromEntries(
        Object.entries(secrets).map(([key, value]) => [key, encryptStoredSecret(value, cipher)])
    );
}

export function mergeOrgSecrets(
    publicConfiguration: Record<string, any>,
    encryptedSecrets: EncryptedOrgSecrets | undefined,
    cipher: SecretCipher
): Record<string, any> {
    if (!encryptedSecrets) {
        return { ...publicConfiguration };
    }

    const secrets = Object.fromEntries(
        Object.entries(encryptedSecrets).map(([key, value]) => [
            key,
            decryptStoredSecret(value, cipher),
        ])
    );

    return {
        ...publicConfiguration,
        ...secrets,
    };
}

export function migrateStoredOrgSecrets(
    storedOrgs: Record<string, any>,
    existingOrgSecrets: Record<string, EncryptedOrgSecrets> | undefined,
    cipher: SecretCipher
): {
    storedOrgs: Record<string, any>;
    orgSecrets: Record<string, EncryptedOrgSecrets>;
    changed: boolean;
} {
    let changed = false;
    const nextStoredOrgs: Record<string, any> = {};
    const nextOrgSecrets: Record<string, EncryptedOrgSecrets> = {
        ...(existingOrgSecrets || {}),
    };

    for (const [alias, configuration] of Object.entries(storedOrgs || {})) {
        const { publicConfiguration, secrets } = splitOrgSecrets(configuration);
        nextStoredOrgs[alias] = publicConfiguration;

        if (Object.keys(secrets).length > 0) {
            nextOrgSecrets[alias] = {
                ...(nextOrgSecrets[alias] || {}),
                ...encryptOrgSecrets(secrets, cipher),
            };
            changed = true;
        }
    }

    return {
        storedOrgs: nextStoredOrgs,
        orgSecrets: nextOrgSecrets,
        changed,
    };
}
