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
 * Both peers are symmetric: either side may send notifications/requests. This
 * core issues requests only for the document port (write/save) and receives
 * notifications (session/webview lifecycle); the class supports the full matrix
 * so the same code serves the host side conceptually too.
 */

export type RpcHandler = (params: any) => unknown | Promise<unknown>;

interface Pending {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
}

export class Rpc {
    private nextId = 1;
    private readonly pending = new Map<number, Pending>();
    private readonly handlers = new Map<string, RpcHandler>();

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

    /** Request/response call; resolves with the peer's `result`. */
    request(method: string, params: unknown): Promise<unknown> {
        const id = this.nextId++;
        return new Promise<unknown>((resolve, reject) => {
            this.pending.set(id, { resolve, reject });
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
            const handler = this.handlers.get(message.method);
            if (message.id == null) {
                // Notification: run the handler (if any), never reply.
                if (handler) {
                    await handler(message.params);
                }
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
            return;
        }

        if (message.id != null) {
            const pending = this.pending.get(message.id);
            this.pending.delete(message.id);
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
}
