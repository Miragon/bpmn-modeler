/**
 * Base message abstractions for the VS Code extension ↔ webview communication protocol.
 *
 * Defines the two foundational message directions:
 * - {@link Query}   — extension host → webview (carries data to display or settings to apply)
 * - {@link Command} — webview → extension host (requests an action or reports a state change)
 *
 * Also contains cross-cutting concrete commands that are not specific to any one
 * modeler feature:
 * - {@link SyncDocumentCommand} — webview notifies the host to persist the current XML to disk
 * - {@link FlushDocumentQuery} / {@link DocumentFlushedCommand} — host asks the
 *   webview to flush debounced changes before a save/close and receives the XML
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

    constructor(content: string) {
        super("SyncDocumentCommand");
        this.content = content;
    }
}

/**
 * Host → webview: asks the webview to flush any debounced-but-unsynced document
 * changes *now* and reply with a {@link DocumentFlushedCommand} carrying the
 * same `token`. Sent on a save (VS Code) or tab-close (IntelliJ) so the persist
 * path never races the outbound sync debounce and writes stale XML.
 */
export class FlushDocumentQuery extends Query {
    public readonly token: number;

    constructor(token: number) {
        super("FlushDocumentQuery");
        this.token = token;
    }
}

/**
 * Webview → host reply to a {@link FlushDocumentQuery}. `content` carries the
 * freshly exported full-document XML; `undefined` means the webview had nothing
 * pending, was not ready, or the export failed — in every case the host must
 * leave its buffer untouched (the host copy is already authoritative). `token`
 * echoes the query so the host can match the reply to its outstanding request
 * and drop stale replies that arrive after a timeout.
 */
export class DocumentFlushedCommand extends Command {
    public readonly token: number;

    public readonly content?: string;

    constructor(token: number, content?: string) {
        super("DocumentFlushedCommand");
        this.token = token;
        this.content = content;
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
