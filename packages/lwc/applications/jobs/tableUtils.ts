import { FILTER_ALL } from './constants';
import type { TabFilter } from './types';

export const INITIAL_RENDER_LIMIT = 200;
export const RENDER_LIMIT_INCREMENT = 200;

export function statusTone(status = '') {
    const normalized = status.toLowerCase();
    if (['completed', 'jobcomplete', 'waiting', 'queued'].includes(normalized)) return 'success';
    if (
        ['processing', 'preparing', 'inprogress', 'holding', 'uploadcomplete'].includes(normalized)
    ) {
        return 'warning';
    }
    if (['failed', 'aborted'].includes(normalized)) return 'error';
    return 'neutral';
}

export function statusBadgeClass(status = '') {
    return `jobs-table-badge jobs-table-badge_${statusTone(status)}`;
}

export function matchesFilter(values: unknown[], status: string, filter?: TabFilter) {
    const search = (filter?.search || '').trim().toLowerCase();
    const statusFilter = filter?.status || FILTER_ALL;
    if (statusFilter !== FILTER_ALL && status !== statusFilter) return false;
    if (!search) return true;
    return values.some(value =>
        String(value ?? '')
            .toLowerCase()
            .includes(search)
    );
}

export function renderedRows<T>(rows: T[], limit = INITIAL_RENDER_LIMIT): T[] {
    return rows.slice(0, limit);
}

export function nextRenderLimit(current: number, total: number): number {
    return Math.min(current + RENDER_LIMIT_INCREMENT, total);
}
