import type { WebviewApi } from "vscode-webview";

/**
 * Channel between a webview and the host application embedding it.
 *
 * A "host" is whatever product renders the webview — the VS Code extension,
 * the IntelliJ plugin, or the standalone desktop app. Every host exposes the
 * same VS Code-style webview bridge, so the webview talks to all of them
 * through this one interface: send messages to the host and persist a little
 * view state across reloads.
 */
export interface HostApi<T, M> {
    /**
     * Get the persisted state of the webview.
     * @returns `undefined` until the first write, e.g. on a webview's first-ever open
     */
    getState(): T | undefined;

    /** Replace the persisted state. */
    setState(state: T): void;

    /** Merge `state` into the persisted state, or seed it when nothing is saved yet. */
    updateState(state: Partial<T>): void;

    postMessage(message: M): void;
}

/**
 * Production {@link HostApi} backed by the host-injected `acquireVsCodeApi()`
 * bridge. VS Code, IntelliJ, and the desktop app all provide this same shim,
 * so this single implementation serves every host.
 */
export class HostApiImpl<T, M> implements HostApi<T, M> {
    private host: WebviewApi<T>;

    constructor() {
        this.host = acquireVsCodeApi();
    }

    getState(): T | undefined {
        return this.host.getState();
    }

    setState(state: T) {
        this.host.setState({
            ...state,
        });
    }

    updateState(state: Partial<T>) {
        this.setState(mergeState(this.getState(), state));
    }

    postMessage(message: M) {
        this.host.postMessage(message);
    }
}

/**
 * Base for development mocks that stand in for a real host, letting a webview
 * run standalone in the browser without any embedding application.
 */
export abstract class MockHostApi<T, M> implements HostApi<T, M> {
    private state: T | undefined;

    getState(): T | undefined {
        return this.state;
    }

    setState(state: T) {
        this.state = state;
        console.debug("[Debug] setState()", this.getState());
    }

    updateState(state: Partial<T>) {
        this.setState(mergeState(this.state, state));
    }

    abstract postMessage(message: M): void;
}

// A first write stores only its partial, so `T` must not require fields that write omits.
function mergeState<T>(saved: T | undefined, partial: Partial<T>): T {
    return { ...saved, ...partial } as T;
}
