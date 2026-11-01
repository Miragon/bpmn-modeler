const FLUSH_REPLY_STATUSES = ["clean", "flushed", "host-updated", "unavailable"] as const;

type FlushReplyStatus = (typeof FLUSH_REPLY_STATUSES)[number];

export type FlushReply =
    | { readonly status: "flushed"; readonly content: string; readonly documentRevision?: number }
    | {
          readonly status: Exclude<FlushReplyStatus, "flushed">;
          readonly documentRevision?: number;
      };

export type PendingSyncObservation =
    | { readonly status: "failed" }
    | { readonly status: "synced"; readonly content: string; readonly documentRevision: number };

export type FlushWriteDecision =
    | { readonly kind: "syncFailed" }
    | { readonly kind: "keepHostDocument" }
    | { readonly kind: "writeExport"; readonly content: string }
    | { readonly kind: "writeObservedSync"; readonly content: string };

export function parseFlushReply(message: Record<PropertyKey, unknown>): FlushReply | undefined {
    const rawContent = message.content ?? undefined;
    if (rawContent !== undefined && typeof rawContent !== "string") {
        return undefined;
    }
    const rawStatus = message.status ?? (rawContent === undefined ? "clean" : "flushed");
    const status = FLUSH_REPLY_STATUSES.find((known) => known === rawStatus) ?? "unavailable";
    const revision =
        typeof message.documentRevision === "number"
            ? { documentRevision: message.documentRevision }
            : {};

    if (status !== "flushed") {
        return { status, ...revision };
    }
    return rawContent === undefined
        ? { status: "unavailable", ...revision }
        : { status, content: rawContent, ...revision };
}

export function decideFlushWrite(
    reply: FlushReply,
    observation: PendingSyncObservation | undefined,
): FlushWriteDecision {
    if (reply.status === "flushed") {
        return { kind: "writeExport", content: reply.content };
    }
    if (observation?.status === "failed") {
        return { kind: "syncFailed" };
    }
    if (reply.status === "host-updated" || observation === undefined) {
        return { kind: "keepHostDocument" };
    }
    // The core rejects a sync made against an older host document; this write must not land it.
    const pageImportedNewerHostDocument =
        reply.documentRevision !== undefined &&
        reply.documentRevision > observation.documentRevision;
    return pageImportedNewerHostDocument
        ? { kind: "keepHostDocument" }
        : { kind: "writeObservedSync", content: observation.content };
}
