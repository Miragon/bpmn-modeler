import { RegisterParams } from "../protocol/types";

/** Drains pending microtasks and one macrotask turn, so "nothing happened" can be asserted. */
export async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}

interface WaitForFrameOptions {
    timeoutMs?: number;
    /** Skips frames emitted before an action, so a stale earlier match cannot satisfy the wait. */
    fromIndex?: number;
    /** Runs after every miss, e.g. to re-trigger a file watcher that dropped its first event. */
    onMiss?: () => Promise<void> | void;
}

/** Polls rather than settling a fixed number of turns: fs-backed flows chain unknown async hops. */
export async function waitForFrame(
    frames: any[],
    predicate: (frame: any) => boolean,
    { timeoutMs = 2000, fromIndex = 0, onMiss }: WaitForFrameOptions = {},
): Promise<any> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const match = frames.slice(fromIndex).find(predicate);
        if (match) return match;
        await onMiss?.();
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("waitForFrame timed out");
}

type RegisterOverrides = Pick<RegisterParams, "sessionId" | "documentRevision" | "settings">;

/** The `session/register` params the host sends when it opens a `.bpmn` editor. */
export function registerParams(
    editorId: string,
    workspaceRoot: string,
    fsPath: string,
    content: string,
    overrides: RegisterOverrides = {},
): RegisterParams {
    return {
        editorId,
        uriString: editorId,
        path: editorId.replace(/^file:\/\//, ""),
        fsPath,
        scheme: "file",
        workspaceRoot,
        content,
        ...overrides,
    };
}

export function hostNotification(method: string, params: unknown): string {
    return JSON.stringify({ method, params });
}

export function hostReply(id: number, result: unknown): string {
    return JSON.stringify({ id, result });
}

export function hostErrorReply(id: number, error: string): string {
    return JSON.stringify({ id, error });
}
