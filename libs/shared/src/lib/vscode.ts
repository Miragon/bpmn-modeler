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

/**
 * `VsCodeApi` implementation that bridges the webview to a local host
 * process over WebSocket. Lets the *same* production webview bundle run in
 * a plain browser (served by `apps/modeler-cli`) without a VS Code host —
 * the runtime-distribution prototype for shipping the modeler with no
 * system Node (#1061).
 *
 * Incoming socket frames are re-dispatched as `window` `MessageEvent`s so
 * the webview's existing message listeners — which expect VS Code's
 * `window.postMessage` delivery — work byte-for-byte unchanged. Outbound
 * messages sent before the socket opens are buffered, since the webview
 * fires its first `Get…Command` during bootstrap.
 *
 * State persists to `localStorage`: the page is a single-tab SPA per file,
 * so tab-scoped storage is the natural analogue of VS Code's webview state.
 */
export class WebSocketChannelImpl<T, M> implements VsCodeApi<T, M> {
    private readonly socket: WebSocket;
    private readonly stateKey: string;
    private readonly pending: M[] = [];

    constructor(url: string, stateKey = "bpmn-modeler-cli:state") {
        this.stateKey = stateKey;
        this.socket = new WebSocket(url);
        this.socket.addEventListener("open", () => {
            for (const message of this.pending) {
                this.socket.send(JSON.stringify(message));
            }
            this.pending.length = 0;
        });
        this.socket.addEventListener("message", (ev: MessageEvent) => {
            try {
                const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
                window.dispatchEvent(new MessageEvent("message", { data }));
            } catch (err) {
                console.error("[WebSocketChannelImpl] failed to parse message", err);
            }
        });
        this.socket.addEventListener("error", (err) => {
            console.error("[WebSocketChannelImpl] socket error", err);
        });
        this.socket.addEventListener("close", () => {
            console.warn("[WebSocketChannelImpl] socket closed");
        });
    }

    getState(): T {
        const raw = window.localStorage.getItem(this.stateKey);
        if (!raw) throw new MissingStateError();
        return JSON.parse(raw) as T;
    }

    setState(state: T): void {
        window.localStorage.setItem(this.stateKey, JSON.stringify(state));
    }

    updateState(state: Partial<T>): void {
        let current: T;
        try {
            current = this.getState();
        } catch {
            current = {} as T;
        }
        this.setState({ ...current, ...state });
    }

    postMessage(message: M): void {
        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        } else {
            this.pending.push(message);
        }
    }
}
