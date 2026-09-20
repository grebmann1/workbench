export function clampPanelWidth(width: number, minimum: number, maximum: number) {
    return Math.min(maximum, Math.max(Math.min(minimum, maximum), width));
}

export function resizeWithKeyboard(
    width: number,
    key: string,
    position: string,
    shift: boolean,
    minimum: number,
    maximum: number
): number | null {
    if (key === 'Home') return Math.min(minimum, maximum);
    if (key === 'End') return maximum;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null;
    const direction = (key === 'ArrowRight' ? 1 : -1) * (position === 'right' ? -1 : 1);
    return clampPanelWidth(width + direction * (shift ? 50 : 10), minimum, maximum);
}
