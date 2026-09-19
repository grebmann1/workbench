type ApplicationTab = {
    id: string;
    path: string;
    isTabVisible?: boolean;
    isDeletable?: boolean;
};

/** Resolve closure before mutating the host's application list. */
export function resolveTabClose<T extends ApplicationTab>(
    applications: T[],
    id: string,
    activeId: string
) {
    const closing = applications.find(tab => tab.id === id);
    if (!closing?.isDeletable) return null;
    const remaining = applications.filter(tab => tab.id !== id);
    if (id !== activeId) return { remaining, nextPath: null };
    const visible = applications.filter(tab => tab.isTabVisible);
    const index = visible.findIndex(tab => tab.id === id);
    const neighbor = visible[index - 1] || visible[index + 1];
    return { remaining, nextPath: neighbor?.path || 'home' };
}
