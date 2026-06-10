import type { WebviewApi } from "vscode-webview";

export interface VsCodeApi<T, M> {
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

export class VsCodeImpl<T, M> implements VsCodeApi<T, M> {
    private vscode: WebviewApi<T>;

    constructor() {
        this.vscode = acquireVsCodeApi();
    }

    getState(): T {
        const state = this.vscode.getState();
        if (!state) throw new MissingStateError();
        return state;
    }

    setState(state: T) {
        this.vscode.setState({
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
        this.vscode.postMessage(message);
    }
}

export abstract class VsCodeMock<T, M> implements VsCodeApi<T, M> {
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
