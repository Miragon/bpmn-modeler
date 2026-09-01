/**
 * Base message abstractions for the VS Code extension ↔ webview communication protocol.
 *
 * Defines the two foundational message directions:
 * - {@link Query}   — extension host → webview (carries data to display or settings to apply)
 * - {@link Command} — webview → extension host (requests an action or reports a state change)
 *
 * Also contains cross-cutting concrete commands that are not specific to any one
 * modeler feature:
 * - {@link SyncDocumentCommand} — webview notifies the host to persist the current document
 * - {@link FlushDocumentQuery} / {@link DocumentFlushedCommand} — host asks the
 *   webview to flush debounced changes before a save/close and receives the content
 * - {@link LogDebugCommand} / {@link LogInfoCommand} / {@link LogWarningCommand} /
 *   {@link LogErrorCommand} — webview forwards a levelled log entry to the host's
 *   output channel
 *
 * @see modeler.ts for the modeler-specific Query and Command implementations that
 * extend these base classes.
 */
interface MessageType {
    type: string;
}

export abstract class Query implements MessageType {
    public readonly type: string;

    protected constructor(type: string) {
        this.type = type;
    }
}

export abstract class Command implements MessageType {
    public readonly type: string;

    protected constructor(type: string) {
        this.type = type;
    }
}

export class SyncDocumentCommand extends Command {
    public readonly content: string;
    public readonly documentRevision: number;

    constructor(content: string, documentRevision = 0) {
        super("SyncDocumentCommand");
        this.content = content;
        this.documentRevision = documentRevision;
    }
}

/**
 * Host → webview: asks the webview to flush any debounced-but-unsynced document
 * changes *now* and reply with a {@link DocumentFlushedCommand} carrying the
 * same `token`. Sent on a save (VS Code) or tab-close (IntelliJ) so the persist
 * path never races the outbound sync debounce and writes stale content.
 */
export class FlushDocumentQuery extends Query {
    public readonly token: number;

    /** Whether the webview must remain mutation-locked until reload or release. */
    public readonly destructive: boolean;

    /** Whether a destructive host needs an exported snapshot even when debounce is idle. */
    public readonly exportWhenClean: boolean;

    constructor(token: number, destructive = false, exportWhenClean = false) {
        super("FlushDocumentQuery");
        this.token = token;
        this.destructive = destructive;
        this.exportWhenClean = exportWhenClean;
    }
}

/** Host → webview: releases a destructive flush when the host cannot reload. */
export class ReleaseDocumentFlushQuery extends Query {
    public readonly token: number;

    constructor(token: number) {
        super("ReleaseDocumentFlushQuery");
        this.token = token;
    }
}

export type DocumentFlushStatus = "clean" | "flushed" | "host-updated" | "unavailable";

/**
 * Webview → host reply to a {@link FlushDocumentQuery}. `status` distinguishes a
 * confirmed-clean host buffer, freshly exported `content`, an authoritative host
 * update, and a modeler that could not flush. `token` lets the host drop replies
 * after timeout/supersession.
 */
export class DocumentFlushedCommand extends Command {
    public readonly token: number;

    public readonly content?: string;

    public readonly status: DocumentFlushStatus;
    public readonly documentRevision?: number;

    constructor(
        token: number,
        content?: string,
        status: DocumentFlushStatus = content === undefined ? "clean" : "flushed",
        documentRevision?: number,
    ) {
        super("DocumentFlushedCommand");
        this.token = token;
        this.content = content;
        this.status = status;
        this.documentRevision = documentRevision;
    }
}

export class LogMessageCommand implements Command {
    public readonly type: string = "LogMessageCommand";

    public readonly message: string;

    /**
     * The originating error's stack, carried as text: a real `Error` doesn't
     * survive `postMessage` here because VS Code JSON-serializes webview
     * messages, and JSON flattens an `Error` to `{}` (dropping `message` and
     * `stack` alike), so the webview passes it as a string the host appends
     * verbatim. Absent for non-error logs.
     */
    public readonly stack?: string;

    constructor(log: string, stack?: string) {
        this.message = log;
        this.stack = stack;
    }
}

export class LogDebugCommand extends LogMessageCommand {
    public override readonly type: string = "LogDebugCommand";
}

export class LogInfoCommand extends LogMessageCommand {
    public override readonly type: string = "LogInfoCommand";
}

export class LogWarningCommand extends LogMessageCommand {
    public override readonly type: string = "LogWarningCommand";
}

export class LogErrorCommand extends LogMessageCommand {
    public override readonly type: string = "LogErrorCommand";
}
