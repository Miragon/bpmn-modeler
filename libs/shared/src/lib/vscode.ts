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
 * `VsCodeApi` implementation that bridges the webview to a local Node.js
 * server over WebSocket. Used by the standalone CLI (`apps/modeler-cli`)
 * so the same webview bundle can run in a browser without a VS Code host.
 *
 * On construction the class opens a WebSocket to the provided URL.
 * `postMessage` buffers outbound messages until the socket is open.
 * Incoming messages are redispatched as `window` `MessageEvent`s so the
 * existing webview listeners work unchanged.
 *
 * State is persisted to `localStorage` (the webview is a single-tab SPA
 * per file, so tab-scoped state is the natural fit).
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
