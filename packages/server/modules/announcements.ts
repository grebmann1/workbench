import fs from 'node:fs/promises';

import type { Application, NextFunction, Request, Response } from 'express';

type AnnouncementVariant = 'info' | 'warning' | 'error' | 'offline' | 'brand';

export type Announcement = {
    id: string;
    active: true;
    variant: AnnouncementVariant;
    title?: string;
    message: string;
    linkLabel?: string;
    linkUrl?: string;
    startsAt?: string;
    endsAt?: string;
};

const ANNOUNCEMENTS_FILE = './assets/server/data/announcements.json';
const VALID_VARIANTS = new Set<AnnouncementVariant>([
    'info',
    'warning',
    'error',
    'offline',
    'brand',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value: unknown): string | undefined {
    const text = normalizeString(value);
    if (!text) return undefined;
    const time = Date.parse(text);
    return Number.isNaN(time) ? undefined : text;
}

function isAllowedUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function isInDateWindow(announcement: Announcement, now: Date): boolean {
    if (announcement.startsAt && Date.parse(announcement.startsAt) > now.getTime()) {
        return false;
    }
    if (announcement.endsAt && Date.parse(announcement.endsAt) <= now.getTime()) {
        return false;
    }
    return true;
}

function normalizeAnnouncement(value: unknown): Announcement | null {
    if (!isRecord(value) || value.active !== true) {
        return null;
    }

    const id = normalizeString(value.id);
    const message = normalizeString(value.message);
    if (!id || !message) {
        return null;
    }

    const variant = normalizeString(value.variant) as AnnouncementVariant;
    const normalized: Announcement = {
        id,
        active: true,
        variant: VALID_VARIANTS.has(variant) ? variant : 'info',
        message,
    };

    const title = normalizeString(value.title);
    if (title) {
        normalized.title = title;
    }

    const linkUrl = normalizeString(value.linkUrl);
    if (linkUrl) {
        if (!isAllowedUrl(linkUrl)) {
            return null;
        }
        normalized.linkUrl = linkUrl;
        const linkLabel = normalizeString(value.linkLabel);
        if (linkLabel) {
            normalized.linkLabel = linkLabel;
        }
    }

    const startsAt = normalizeDate(value.startsAt);
    if (startsAt) {
        normalized.startsAt = startsAt;
    }

    const endsAt = normalizeDate(value.endsAt);
    if (endsAt) {
        normalized.endsAt = endsAt;
    }

    return normalized;
}

function getAnnouncementCandidates(data: unknown): unknown[] {
    if (!isRecord(data)) {
        return [];
    }
    if (Array.isArray(data.announcements)) {
        return data.announcements;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'announcement')) {
        return [data.announcement];
    }
    return [];
}

export function selectAnnouncement(candidates: unknown[], now = new Date()): Announcement | null {
    for (const candidate of candidates) {
        const announcement = normalizeAnnouncement(candidate);
        if (announcement && isInDateWindow(announcement, now)) {
            return announcement;
        }
    }
    return null;
}

async function loadAnnouncement(now = new Date()): Promise<Announcement | null> {
    const content = await fs.readFile(ANNOUNCEMENTS_FILE, 'utf-8');
    const data = JSON.parse(content) as unknown;
    return selectAnnouncement(getAnnouncementCandidates(data), now);
}

export default function announcements(app: Application, path = '/api/announcements') {
    app.get(path, async (_req: Request, res: Response, next: NextFunction) => {
        try {
            res.set('Access-Control-Allow-Origin', '*');
            const announcement = await loadAnnouncement();
            res.json({ announcement });
        } catch (error) {
            next(error);
        }
    });
}

export const __testables = {
    getAnnouncementCandidates,
    normalizeAnnouncement,
    selectAnnouncement,
};
