import { cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import type * as vscode from "vscode";

const DRIVER_SOURCES = fileURLToPath(new URL("./driver/", import.meta.url));
const ENDPOINT_FILE = "endpoint.json";
const RETRY_INTERVAL_MS = 100;
const delay = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

export type VsCodeApi = typeof vscode;

interface Endpoint {
    port: number;
    token: string;
}

/** A call the driver ran, or one that never reached a driver and can be sent again. */
type Attempt = { reached: true; result: unknown } | { reached: false; reason: unknown };

function isConnectionRefused(error: unknown): boolean {
    const cause = (error as { cause?: { code?: string; errors?: { code?: string }[] } }).cause;
    return (
        cause?.code === "ECONNREFUSED" ||
        (cause?.errors ?? []).some(({ code }) => code === "ECONNREFUSED")
    );
}

/**
 * Runs functions against the VS Code API of a window, through the companion
 * extension in `./driver`. A function is sent as its source text, so it can
 * use its two parameters only, as with Playwright's `evaluate`.
 */
export class VsCodeDriver {
    private constructor(
        readonly extensionPath: string,
        private readonly timeoutMs: number,
    ) {}

    /** Copies the driver into `sessionRoot`, where the window started on it writes its endpoint. */
    static async install(sessionRoot: string, timeoutMs: number): Promise<VsCodeDriver> {
        const extensionPath = join(sessionRoot, "driver");
        await cp(DRIVER_SOURCES, extensionPath, { recursive: true });
        // The endpoint of an earlier window on this root answers no more.
        await rm(join(extensionPath, ENDPOINT_FILE), { force: true });
        return new VsCodeDriver(extensionPath, timeoutMs);
    }

    /**
     * Waits for the window's extension host, also after a reload, which starts
     * a new one on a new port. A call that awaits a modal dialog never returns:
     * start such a command without awaiting it.
     */
    async evaluate<Result, Argument = undefined>(
        run: (api: VsCodeApi, argument: Argument) => Result | Promise<Result>,
        argument?: Argument,
    ): Promise<Awaited<Result>> {
        const deadline = Date.now() + this.timeoutMs;
        let lastReason: unknown = new Error("no attempt was made");
        while (Date.now() < deadline) {
            const attempt = await this.send(run.toString(), argument, deadline);
            if (attempt.reached) return attempt.result as Awaited<Result>;
            lastReason = attempt.reason;
            await delay(RETRY_INTERVAL_MS);
        }
        throw new Error(
            `the smoke driver was not reachable within ${this.timeoutMs} ms: ${String(lastReason)}`,
        );
    }

    /** Throws once a driver has the call: sending it again could run it twice. */
    private async send(source: string, argument: unknown, deadline: number): Promise<Attempt> {
        const endpoint = await readFile(join(this.extensionPath, ENDPOINT_FILE), "utf8")
            .then((text) => JSON.parse(text) as Endpoint)
            .catch((reason: unknown) => ({ reason }));
        // Not written yet, or the window is halfway through writing it.
        if ("reason" in endpoint) return { reached: false, reason: endpoint.reason };
        let response: Response;
        try {
            response = await fetch(`http://127.0.0.1:${endpoint.port}/`, {
                method: "POST",
                headers: {
                    "authorization": `Bearer ${endpoint.token}`,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ source, argument }),
                signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
            });
        } catch (error) {
            // Nothing listens there yet, or no more: the endpoint file is about to change.
            if (isConnectionRefused(error)) return { reached: false, reason: error };
            throw new Error(
                `the smoke driver did not answer a call (a modal dialog may be waiting): ${String(error)}`,
                { cause: error },
            );
        }
        // Another process took the port of a window that is gone.
        if (response.status === 401) {
            return { reached: false, reason: new Error("the port has a new owner") };
        }
        const answer = (await response.json()) as { result?: unknown; error?: string };
        if (!response.ok) {
            throw new Error(answer.error ?? `the smoke driver answered ${response.status}`);
        }
        return { reached: true, result: answer.result };
    }
}
