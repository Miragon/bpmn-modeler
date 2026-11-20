import { window } from "vscode";

/**
 * Resolves once the open tabs satisfy `condition`, checked now and on every
 * tab change, or after `timeoutMs`, when it calls `onTimeout` first.
 */
export function untilTabsSatisfy(
    condition: () => boolean,
    { timeoutMs, onTimeout }: { readonly timeoutMs: number; readonly onTimeout: () => void },
): Promise<void> {
    if (condition()) return Promise.resolve();
    return new Promise((resolve) => {
        const subscription = window.tabGroups.onDidChangeTabs(() => {
            if (condition()) settle();
        });
        const timeout = setTimeout(() => {
            onTimeout();
            settle();
        }, timeoutMs);
        function settle(): void {
            clearTimeout(timeout);
            subscription.dispose();
            resolve();
        }
    });
}
