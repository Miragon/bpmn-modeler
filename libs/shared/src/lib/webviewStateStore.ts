import type { HostApi } from "./host";

export type WebviewStateHost<T> = Pick<HostApi<T, unknown>, "getState" | "updateState">;

/**
 * Read/merge view of the persisted webview state, so a consumer that owns one
 * slice of it depends on neither messaging nor whole-state writes.
 */
export interface WebviewStateStore<T> {
    read(): T | undefined;
    merge(partial: Partial<T>): void;
}

export function createWebviewStateStore<T>(host: WebviewStateHost<T>): WebviewStateStore<T> {
    return {
        read: () => host.getState(),
        merge: (partial) => host.updateState(partial),
    };
}
