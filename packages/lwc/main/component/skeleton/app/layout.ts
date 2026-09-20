import {
    COMPACT_SHELL_WIDTH,
    MIN_WORKSPACE_WIDTH,
    MIN_ASSISTANT_WIDTH,
    NAVIGATION_RAIL_WIDTH,
    SHELL_GUTTERS,
} from './constants';

export function getShellLayout(
    width: number,
    collapsed: boolean,
    assistantOpen: boolean,
    navigationExpanded = false
) {
    const compact = width < COMPACT_SHELL_WIDTH;
    const assistantMaxWidth = Math.max(
        MIN_ASSISTANT_WIDTH,
        width - NAVIGATION_RAIL_WIDTH - MIN_WORKSPACE_WIDTH - SHELL_GUTTERS
    );
    return {
        compact,
        navigationFocused: compact && navigationExpanded,
        menuCollapsed: compact ? !navigationExpanded : collapsed || assistantOpen,
        assistantFocused:
            assistantOpen &&
            width <
                NAVIGATION_RAIL_WIDTH + MIN_WORKSPACE_WIDTH + MIN_ASSISTANT_WIDTH + SHELL_GUTTERS,
        assistantMaxWidth,
    };
}
