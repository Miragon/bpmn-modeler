import { RegisterParams, StatusBarUpdateParams } from "../protocol/domain/types";

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

type RegisterOverrides = Pick<
    RegisterParams,
    | "sessionId"
    | "documentRevision"
    | "settings"
    | "pluginApprovals"
    | "pluginApprovalsRevision"
    | "workspaceTrust"
>;

/** The `session/register` params the host sends when it opens a `.bpmn` editor of a trusted project. */
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
        workspaceTrust: { trusted: true, revision: 1 },
        ...overrides,
    };
}

/** An emitted frame, as far as a status-slot assertion reads it. */
export interface StatusSlotFrame {
    readonly method?: string;
    readonly params?: Partial<StatusBarUpdateParams>;
}

/** Matches the core's `statusBar/update` frames for one slot; `view: null` hides it. */
export function isStatusSlotUpdate(
    slot: StatusBarUpdateParams["slot"],
): (frame: StatusSlotFrame) => boolean {
    return (frame) => frame.method === "statusBar/update" && frame.params?.slot === slot;
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

/**
 * Answers every request for `method` the core sends, now and later, with
 * `result()` at the time it arrives, as a host that is always there does;
 * the returned function stops it.
 */
export function keepAnswering(
    handleLine: (line: string) => Promise<void>,
    frames: readonly { readonly id?: number; readonly method?: string }[],
    method: string,
    result: () => unknown,
): () => void {
    const answered = new Set<number>();
    const timer = setInterval(() => {
        for (const { id, method: sent } of frames) {
            if (sent === method && id !== undefined && !answered.has(id)) {
                answered.add(id);
                void handleLine(hostReply(id, result()));
            }
        }
    }, 5);
    return () => clearInterval(timer);
}
