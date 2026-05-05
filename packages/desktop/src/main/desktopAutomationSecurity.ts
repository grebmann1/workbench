import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http, { type IncomingHttpHeaders, type IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

export const DEFAULT_AUTOMATION_HOST = '127.0.0.1';
export const DEFAULT_AUTOMATION_BODY_LIMIT_BYTES = 1024 * 1024;
export const WORKBENCH_DESKTOP_DIR_NAME = 'Workbench Desktop';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function normalizeAutomationHost(host?: string | null): string {
    const value = String(host || '').trim();
    if (!value) {
        return DEFAULT_AUTOMATION_HOST;
    }

    const normalizedHost = value.replace(/^https?:\/\//, '').split(':')[0] || '';
    return LOOPBACK_HOSTS.has(normalizedHost) ? normalizedHost : DEFAULT_AUTOMATION_HOST;
}

export function assertAuthorizedAutomationRequest(
    headers: IncomingHttpHeaders,
    expectedToken: string | null | undefined
): void {
    if (!expectedToken) {
        throw new Error('Desktop automation token is not configured.');
    }

    const authorization = String(headers.authorization || '').trim();
    const actualToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const expected = Buffer.from(expectedToken);
    const actual = Buffer.from(actualToken);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
        throw new Error('Unauthorized desktop automation request.');
    }
}

export async function readBoundedJsonBody(
    request: IncomingMessage | Readable,
    limitBytes = DEFAULT_AUTOMATION_BODY_LIMIT_BYTES
): Promise<Record<string, any>> {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        totalBytes += buffer.length;
        if (totalBytes > limitBytes) {
            throw new Error('Automation request body is too large.');
        }
        chunks.push(buffer);
    }

    if (chunks.length === 0) {
        return {};
    }

    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function getDesktopUserDataPath(
    platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
    homeDirectory = os.homedir()
): string {
    if (env.WORKBENCH_DESKTOP_USER_DATA_DIR) {
        return env.WORKBENCH_DESKTOP_USER_DATA_DIR;
    }

    if (platform === 'darwin') {
        return path.join(
            homeDirectory,
            'Library',
            'Application Support',
            WORKBENCH_DESKTOP_DIR_NAME
        );
    }

    if (platform === 'win32') {
        return path.join(
            env.APPDATA || path.join(homeDirectory, 'AppData', 'Roaming'),
            WORKBENCH_DESKTOP_DIR_NAME
        );
    }

    return path.join(
        env.XDG_CONFIG_HOME || path.join(homeDirectory, '.config'),
        WORKBENCH_DESKTOP_DIR_NAME
    );
}

export function getAutomationTokenPath(userDataPath: string): string {
    return path.join(userDataPath, 'automation-token');
}

export async function ensureAutomationToken(userDataPath: string): Promise<string> {
    const tokenPath = getAutomationTokenPath(userDataPath);
    try {
        const existingToken = (await fs.readFile(tokenPath, 'utf8')).trim();
        if (existingToken) {
            return existingToken;
        }
    } catch {
        // Missing token files are created below.
    }

    const token = crypto.randomBytes(32).toString('base64url');
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, token, { encoding: 'utf8', mode: 0o600 });
    await fs.chmod(tokenPath, 0o600).catch(() => {
        // Best effort on platforms that do not support POSIX modes.
    });
    return token;
}

export async function readAutomationTokenForCli(
    env: NodeJS.ProcessEnv = process.env,
    platform = process.platform,
    homeDirectory = os.homedir()
): Promise<string | null> {
    if (env.WORKBENCH_DESKTOP_API_TOKEN) {
        return env.WORKBENCH_DESKTOP_API_TOKEN;
    }

    try {
        return (
            await fs.readFile(
                getAutomationTokenPath(getDesktopUserDataPath(platform, env, homeDirectory)),
                'utf8'
            )
        ).trim();
    } catch {
        return null;
    }
}

export function writeJson(
    response: http.ServerResponse,
    statusCode: number,
    payload: unknown
): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(payload));
}
