import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';

import { app } from 'electron';

type LogLevel = 'error' | 'info' | 'warn';

let processHandlersRegistered = false;

export function redactSecrets(value: string): string {
    return value
        .replace(/force:\/\/[^@\s]+@[^\s]+/g, 'force://<redacted>@<redacted>')
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
        .replace(
            /(accessToken|refreshToken|sessionId|sfdxAuthUrl)["':=\s]+[A-Za-z0-9._~!+/=-]+/gi,
            '$1=<redacted>'
        );
}

function serializeLogPart(part: unknown): string {
    if (part instanceof Error) {
        return redactSecrets(part.stack || part.message);
    }

    if (typeof part === 'string') {
        return redactSecrets(part);
    }

    return redactSecrets(util.inspect(part, { breakLength: 120, depth: 6 }));
}

async function appendLog(level: LogLevel, parts: unknown[]): Promise<void> {
    const logPath = path.join(app.getPath('logs'), 'main.log');
    const line = [
        new Date().toISOString(),
        level.toUpperCase(),
        parts.map(serializeLogPart).join(' '),
    ].join(' ');

    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `${line}\n`, 'utf8');
}

function writeLog(level: LogLevel, parts: unknown[]): void {
    void appendLog(level, parts).catch(() => {
        // Logging must never make the app fail harder.
    });
}

export const desktopLog = {
    error: (...parts: unknown[]): void => writeLog('error', parts),
    info: (...parts: unknown[]): void => writeLog('info', parts),
    warn: (...parts: unknown[]): void => writeLog('warn', parts),
};

export function registerDesktopLoggerProcessHandlers(): void {
    if (processHandlersRegistered) {
        return;
    }

    processHandlersRegistered = true;
    process.on('uncaughtException', error => {
        desktopLog.error('Uncaught exception', error);
    });
    process.on('unhandledRejection', reason => {
        desktopLog.error('Unhandled rejection', reason);
    });
}
