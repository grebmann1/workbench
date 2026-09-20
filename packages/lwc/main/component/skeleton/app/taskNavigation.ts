type TaskApplication = {
    path: string;
    name: string;
    label: string;
    isElectronOnly?: boolean;
    isChromeOnly?: boolean;
};

export function resolveTaskTarget<T extends TaskApplication>(
    apps: T[],
    path: unknown,
    platform: { electron: boolean; chrome: boolean },
    betaEnabled = false
): T | null {
    if (typeof path !== 'string') return null;
    return (
        apps.find(
            app =>
                app.path === path &&
                (!app.isElectronOnly || platform.electron) &&
                (!app.isChromeOnly || platform.chrome) &&
                (app.path !== 'smartinput' || betaEnabled)
        ) || null
    );
}
