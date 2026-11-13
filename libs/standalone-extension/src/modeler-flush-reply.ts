// A copy of the flush reply table in libs/shared/src/lib/documentFlush.ts, which this
// package's build cannot import; the spec runs the shared rows and pins the types to it.

const FLUSH_REPLY_STATUSES = ["clean", "flushed", "host-updated", "unavailable"] as const;

export type FlushReplyStatus = (typeof FLUSH_REPLY_STATUSES)[number];

export type FlushReply =
    | { readonly status: "flushed"; readonly content: string; readonly documentRevision?: number }
    | {
          readonly status: Exclude<FlushReplyStatus, "flushed">;
          readonly documentRevision?: number;
      };

export type ObservedPageSync =
    | { readonly status: "failed" }
    | { readonly status: "synced"; readonly content: string; readonly documentRevision: number };

export type FlushWriteDecision =
    | { readonly kind: "writeExport"; readonly content: string; readonly documentRevision?: number }
    | {
          readonly kind: "writeObservedSync";
          readonly content: string;
          readonly documentRevision: number;
      }
    | { readonly kind: "awaitSentSyncs" }
    | { readonly kind: "keepHostDocument" }
    | { readonly kind: "syncFailed" }
    | { readonly kind: "unavailable" };

export function parseFlushReply(message: {
    readonly content?: unknown;
    readonly status?: unknown;
    readonly documentRevision?: unknown;
}): FlushReply | undefined {
    const content = message.content ?? undefined;
    if (content !== undefined && typeof content !== "string") {
        return undefined;
    }
    const rawStatus = message.status ?? (content === undefined ? "clean" : "flushed");
    const status = FLUSH_REPLY_STATUSES.find((known) => known === rawStatus) ?? "unavailable";
    const revision =
        typeof message.documentRevision === "number"
            ? { documentRevision: message.documentRevision }
            : {};

    if (status !== "flushed") {
        return { status, ...revision };
    }
    return content === undefined
        ? { status: "unavailable", ...revision }
        : { status, content, ...revision };
}

export function decideFlushWrite(
    reply: FlushReply,
    observedSync: ObservedPageSync | undefined,
    destructive: boolean,
): FlushWriteDecision {
    if (reply.status === "flushed") {
        return reply.documentRevision === undefined
            ? { kind: "writeExport", content: reply.content }
            : {
                  kind: "writeExport",
                  content: reply.content,
                  documentRevision: reply.documentRevision,
              };
    }
    if (observedSync?.status === "failed") {
        return { kind: "syncFailed" };
    }
    if (reply.status === "host-updated") {
        return { kind: "keepHostDocument" };
    }
    if (observedSync === undefined) {
        return reply.status === "clean" ? { kind: "awaitSentSyncs" } : { kind: "unavailable" };
    }
    if (reply.status === "clean" && destructive) {
        return { kind: "keepHostDocument" };
    }
    const pageImportedNewerHostDocument =
        reply.documentRevision !== undefined &&
        reply.documentRevision > observedSync.documentRevision;
    return pageImportedNewerHostDocument
        ? { kind: "keepHostDocument" }
        : {
              kind: "writeObservedSync",
              content: observedSync.content,
              documentRevision: observedSync.documentRevision,
          };
}
