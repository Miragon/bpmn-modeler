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
 * - {@link ShowInfoCommand} — webview asks the host to surface a user-facing
 *   information notification
 * - {@link RequestFocusCommand} / {@link TakeFocusQuery} — webview asks whether it
 *   may take keyboard focus; the host answers only for the active editor
 *
 * @see modeler.ts for the modeler-specific Query and Command implementations that
 * extend these base classes.
 */
export abstract class Query<TType extends string = string> {
    public readonly type: TType;

    protected constructor(type: TType) {
        this.type = type;
    }
}

export abstract class Command<TType extends string = string> {
    public readonly type: TType;

    protected constructor(type: TType) {
        this.type = type;
    }
}

export class SyncDocumentCommand extends Command<"SyncDocumentCommand"> {
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
export class FlushDocumentQuery extends Query<"FlushDocumentQuery"> {
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
export class ReleaseDocumentFlushQuery extends Query<"ReleaseDocumentFlushQuery"> {
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
export class DocumentFlushedCommand extends Command<"DocumentFlushedCommand"> {
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

export abstract class LogMessageCommand<TType extends string = string> extends Command<TType> {
    public readonly message: string;

    /**
     * The originating error's stack, carried as text: a real `Error` doesn't
     * survive `postMessage` here because VS Code JSON-serializes webview
     * messages, and JSON flattens an `Error` to `{}` (dropping `message` and
     * `stack` alike), so the webview passes it as a string the host appends
     * verbatim. Absent for non-error logs.
     */
    public readonly stack?: string;

    protected constructor(type: TType, log: string, stack?: string) {
        super(type);
        this.message = log;
        this.stack = stack;
    }
}

export class LogDebugCommand extends LogMessageCommand<"LogDebugCommand"> {
    constructor(log: string, stack?: string) {
        super("LogDebugCommand", log, stack);
    }
}

export class LogInfoCommand extends LogMessageCommand<"LogInfoCommand"> {
    constructor(log: string, stack?: string) {
        super("LogInfoCommand", log, stack);
    }
}

export class LogWarningCommand extends LogMessageCommand<"LogWarningCommand"> {
    constructor(log: string, stack?: string) {
        super("LogWarningCommand", log, stack);
    }
}

export class LogErrorCommand extends LogMessageCommand<"LogErrorCommand"> {
    constructor(log: string, stack?: string) {
        super("LogErrorCommand", log, stack);
    }
}

/**
 * A user-facing information notification (VS Code toast / IntelliJ balloon).
 * Unlike the `Log*Command`s, which only reach the host's log sink, this is for
 * messages the user must see without opening the output channel — the sandboxed
 * webview has no notification UI of its own.
 */
export class ShowInfoCommand extends Command<"ShowInfoCommand"> {
    public readonly message: string;

    constructor(message: string) {
        super("ShowInfoCommand");
        this.message = message;
    }
}

/**
 * Webview → host, once the modeler is ready. A re-created VS Code webview never
 * receives the focus VS Code meant for it, and only the host knows whether its
 * editor is the active one.
 */
export class RequestFocusCommand extends Command<"RequestFocusCommand"> {
    constructor() {
        super("RequestFocusCommand");
    }
}

/** Host → webview reply to {@link RequestFocusCommand}: the editor is active. */
export class TakeFocusQuery extends Query<"TakeFocusQuery"> {
    constructor() {
        super("TakeFocusQuery");
    }
}
