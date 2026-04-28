import {
    CACHE_CONFIG,
    loadSingleExtensionConfigFromCache,
    saveSingleExtensionConfigToCache,
} from 'shared/cacheManager';
import LOGGER from 'shared/logger';

export type AnnouncementVariant = 'info' | 'warning' | 'error' | 'offline' | 'brand';

export type RemoteAnnouncement = {
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

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type FetchAnnouncementOptions = {
    announcementUrl?: string;
    baseUrl?: string;
    fetchImpl?: FetchLike;
};

const VALID_VARIANTS = new Set<AnnouncementVariant>([
    'info',
    'warning',
    'error',
    'offline',
    'brand',
]);
const CONFIGURED_ANNOUNCEMENT_URL = process.env.WORKBENCH_ANNOUNCEMENTS_URL || '';
const CONFIGURED_WORKBENCH_BASE_URL = process.env.WORKBENCH_BASE_URL || '';

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value: unknown): string | undefined {
    const text = normalizeString(value);
    if (!text) return undefined;
    return Number.isNaN(Date.parse(text)) ? undefined : text;
}

function isSafeLink(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function getConfiguredAnnouncementUrl(): string {
    return normalizeString(CONFIGURED_ANNOUNCEMENT_URL);
}

function getConfiguredWorkbenchBaseUrl(): string {
    return normalizeString(CONFIGURED_WORKBENCH_BASE_URL);
}

function isInDateWindow(announcement: RemoteAnnouncement, now: Date): boolean {
    if (announcement.startsAt && Date.parse(announcement.startsAt) > now.getTime()) {
        return false;
    }
    if (announcement.endsAt && Date.parse(announcement.endsAt) <= now.getTime()) {
        return false;
    }
    return true;
}

export function resolveAnnouncementEndpoint(
    announcementUrl = getConfiguredAnnouncementUrl(),
    baseUrl = getConfiguredWorkbenchBaseUrl()
): string {
    const normalizedAnnouncementUrl = normalizeString(announcementUrl).replace(/\/+$/, '');
    if (normalizedAnnouncementUrl) {
        return normalizedAnnouncementUrl;
    }

    const normalizedBaseUrl = normalizeString(baseUrl).replace(/\/+$/, '');
    return normalizedBaseUrl ? `${normalizedBaseUrl}/api/announcements` : '';
}

export function normalizeAnnouncementPayload(
    payload: unknown,
    now = new Date()
): RemoteAnnouncement | null {
    if (!isRecord(payload) || !isRecord(payload.announcement)) {
        return null;
    }

    const source = payload.announcement;
    if (source.active !== true) {
        return null;
    }

    const id = normalizeString(source.id);
    const message = normalizeString(source.message);
    if (!id || !message) {
        return null;
    }

    const variant = normalizeString(source.variant) as AnnouncementVariant;
    const announcement: RemoteAnnouncement = {
        id,
        active: true,
        variant: VALID_VARIANTS.has(variant) ? variant : 'info',
        message,
    };

    const title = normalizeString(source.title);
    if (title) {
        announcement.title = title;
    }

    const linkUrl = normalizeString(source.linkUrl);
    if (linkUrl) {
        if (!isSafeLink(linkUrl)) {
            return null;
        }
        announcement.linkUrl = linkUrl;
        const linkLabel = normalizeString(source.linkLabel);
        if (linkLabel) {
            announcement.linkLabel = linkLabel;
        }
    }

    const startsAt = normalizeDate(source.startsAt);
    if (startsAt) {
        announcement.startsAt = startsAt;
    }

    const endsAt = normalizeDate(source.endsAt);
    if (endsAt) {
        announcement.endsAt = endsAt;
    }

    return isInDateWindow(announcement, now) ? announcement : null;
}

export async function fetchRemoteAnnouncement({
    announcementUrl,
    baseUrl,
    fetchImpl = fetch,
}: FetchAnnouncementOptions = {}): Promise<RemoteAnnouncement | null> {
    const endpoint = resolveAnnouncementEndpoint(announcementUrl, baseUrl);
    if (!endpoint) {
        LOGGER.warn('fetchRemoteAnnouncement - no endpoint configured');
        return null;
    }

    try {
        const response = await fetchImpl(endpoint);
        if (!response.ok) {
            LOGGER.warn('fetchRemoteAnnouncement - endpoint failed', endpoint, response.status);
            return null;
        }
        return normalizeAnnouncementPayload(await response.json());
    } catch (error) {
        LOGGER.warn('fetchRemoteAnnouncement - request failed', endpoint, error);
        return null;
    }
}

function normalizeDismissedIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(value.map(normalizeString).filter(Boolean))];
}

export async function getDismissedAnnouncementIds(): Promise<string[]> {
    const value = await loadSingleExtensionConfigFromCache<unknown>(
        CACHE_CONFIG.ANNOUNCEMENT_DISMISSED_IDS.key
    );
    return normalizeDismissedIds(value);
}

export async function isAnnouncementDismissed(id: string): Promise<boolean> {
    const normalizedId = normalizeString(id);
    if (!normalizedId) {
        return false;
    }

    const dismissedIds = await getDismissedAnnouncementIds();
    return dismissedIds.includes(normalizedId);
}

export async function markAnnouncementDismissed(id: string): Promise<void> {
    const normalizedId = normalizeString(id);
    if (!normalizedId) {
        return;
    }

    const dismissedIds = await getDismissedAnnouncementIds();
    if (dismissedIds.includes(normalizedId)) {
        return;
    }

    await saveSingleExtensionConfigToCache(CACHE_CONFIG.ANNOUNCEMENT_DISMISSED_IDS.key, [
        ...dismissedIds,
        normalizedId,
    ]);
}
