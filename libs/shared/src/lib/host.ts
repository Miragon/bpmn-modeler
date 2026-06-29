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
     * Get the current state of the webview.
     * @throws MissingStateError if the state is missing
     */
    getState(): T;

    setState(state: T): void;

    updateState(state: Partial<T>): void;

    postMessage(message: M): void;
}

export class MissingStateError extends Error {
    constructor() {
        super("State is missing.");
    }
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

    getState(): T {
        const state = this.host.getState();
        if (!state) throw new MissingStateError();
        return state;
    }

    setState(state: T) {
        this.host.setState({
            ...state,
        });
    }

    updateState(state: Partial<T>) {
        this.setState({
            ...this.getState(),
            ...state,
        });
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
    protected state: T | undefined;

    getState(): T {
        if (!this.state) throw new MissingStateError();
        return this.state;
    }

    setState(state: T) {
        this.state = state;
        console.debug("[Debug] setState()", this.getState());
    }

    abstract updateState(state: Partial<T>): void;

    abstract postMessage(message: M): void;
}
