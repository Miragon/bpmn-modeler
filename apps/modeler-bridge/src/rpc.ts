/**
 * Minimal bidirectional JSON-RPC peer over a line-delimited (NDJSON) byte
 * stream — the transport between the IntelliJ host (Kotlin) and this core.
 *
 * NDJSON rather than LSP-style `Content-Length` framing: one JSON object per
 * line is the smallest thing that carries requests, responses, and
 * notifications in both directions, and stdio is already line-oriented on the
 * Kotlin side. stdout is the RPC channel and carries nothing else; all
 * diagnostics go to stderr.
 *
 * Frame shapes (all single-line JSON):
 *  - notification: `{ "method": m, "params": p }`            (no reply expected)
 *  - request:      `{ "method": m, "params": p, "id": n }`   (reply expected)
 *  - response:     `{ "id": n, "result": r }` | `{ "id": n, "error": s }`
 *
 * Either side may send notifications and requests. How long a request waits
 * for its reply is the protocol descriptor's `replyWait` for its method, so this
 * peer is bound to the bridge protocol.
 */

import { replyDeadlineMs } from "./protocol/descriptor";

export type RpcHandler = (params: any) => unknown | Promise<unknown>;

interface Pending {
    method: string;
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    deadline?: ReturnType<typeof setTimeout>;
}

export class Rpc {
    private nextId = 1;
    private inputEnded = false;
    private readonly pending = new Map<number, Pending>();
    private readonly handlers = new Map<string, RpcHandler>();
    private readonly inboundCalls = new Map<string, Promise<void>>();

    /** @param write Emits one framed line (caller appends the newline + flushes). */
    constructor(private readonly write: (line: string) => void) {}

    /** Registers the handler invoked when the peer calls `method`. */
    on(method: string, handler: RpcHandler): void {
        this.handlers.set(method, handler);
    }

    /** Fire-and-forget call; no response is correlated. */
    notify(method: string, params: unknown): void {
        this.write(JSON.stringify({ method, params }));
    }

    /**
     * Request/response call; resolves with the peer's `result`. Rejects on an
     * error reply, once the method's reply deadline passes, or when the input
     * has ended, so the caller's own error handling runs and its queue moves on.
     */
    request(method: string, params: unknown): Promise<unknown> {
        if (this.inputEnded) {
            return Promise.reject(inputEndedError(method));
        }
        const id = this.nextId++;
        return new Promise<unknown>((resolve, reject) => {
            const pending: Pending = { method, resolve, reject };
            const deadlineMs = replyDeadlineMs(method);
            if (deadlineMs !== undefined) {
                pending.deadline = setTimeout(() => {
                    this.take(id)?.reject(
                        new Error(`No reply to ${method} within ${deadlineMs / 1000} s`),
                    );
                }, deadlineMs);
            }
            this.pending.set(id, pending);
            this.write(JSON.stringify({ method, params, id }));
        });
    }

    /**
     * Feeds one received line into the peer. A frame carrying `method` is an
     * inbound call (request if it has an `id`, else a notification); a frame
     * without `method` is a response to one of our outstanding requests.
     */
    async handleLine(line: string): Promise<void> {
        const trimmed = line.trim();
        if (!trimmed) {
            return;
        }
        const message = JSON.parse(trimmed) as {
            method?: string;
            params?: unknown;
            id?: number;
            result?: unknown;
            error?: string;
        };

        if (message.method) {
            const queueKey = this.callQueueKey(message);
            const previous = this.inboundCalls.get(queueKey) ?? Promise.resolve();
            const handling = previous.then(
                () => this.handleCall(message),
                () => this.handleCall(message),
            );
            const settled = handling.catch(() => undefined);
            this.inboundCalls.set(queueKey, settled);
            void settled.then(() => {
                if (this.inboundCalls.get(queueKey) === settled) {
                    this.inboundCalls.delete(queueKey);
                }
            });
            await handling;
            return;
        }

        if (message.id != null) {
            const pending = this.take(message.id);
            if (!pending) {
                return;
            }
            if (message.error) {
                pending.reject(new Error(message.error));
            } else {
                pending.resolve(message.result ?? null);
            }
        }
    }

    /** The peer can no longer answer: rejects every outstanding request and every later one. */
    handleEnd(): void {
        this.inputEnded = true;
        for (const [id, { method }] of this.pending) {
            this.take(id)?.reject(inputEndedError(method));
        }
    }

    /** Removes an outstanding request, so exactly one of reply, deadline and end settles it. */
    private take(id: number): Pending | undefined {
        const pending = this.pending.get(id);
        this.pending.delete(id);
        clearTimeout(pending?.deadline);
        return pending;
    }

    private callQueueKey(message: { method?: string; params?: unknown }): string {
        const params = message.params;
        if (params && typeof params === "object" && "editorId" in params) {
            const editorId = (params as { editorId?: unknown }).editorId;
            if (typeof editorId === "string") return `editor:${editorId}`;
        }
        return `method:${message.method}`;
    }

    private async handleCall(message: {
        method?: string;
        params?: unknown;
        id?: number;
    }): Promise<void> {
        const handler = this.handlers.get(message.method!);
        if (message.id == null) {
            if (handler) await handler(message.params);
            return;
        }
        try {
            const result = handler ? await handler(message.params) : null;
            this.write(JSON.stringify({ id: message.id, result: result ?? null }));
        } catch (error) {
            this.write(
                JSON.stringify({
                    id: message.id,
                    error: error instanceof Error ? error.message : String(error),
                }),
            );
        }
    }
}

function inputEndedError(method: string): Error {
    return new Error(`No reply to ${method}: the input ended`);
}
