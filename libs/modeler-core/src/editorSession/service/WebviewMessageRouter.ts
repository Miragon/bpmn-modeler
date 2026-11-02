import { Command, MessageOfType, ProtocolCommandType } from "@miragon/bpmn-modeler-shared";

/**
 * Handles a single webview command, narrowed to the command type it was
 * registered for, together with its sender: the editor id, or the diff pane.
 */
export type MessageHandler<TMessage extends Command = Command, TSource = string> = (
    message: TMessage,
    source: TSource,
) => void | Promise<void>;

export type MessageRoute =
    | { readonly kind: "handled" }
    | { readonly kind: "ignored"; readonly reason: string }
    | { readonly kind: "unrouted" };

/** A command's handlers in run order, or the reason its editor drops it. */
export type CommandRoute<TType extends ProtocolCommandType, TSource = string> =
    | readonly [
          MessageHandler<MessageOfType<TType>, TSource>,
          ...MessageHandler<MessageOfType<TType>, TSource>[],
      ]
    | { readonly ignored: string };

/** Routes for a closed set of command types: a type without an entry fails to compile. */
export type CommandTable<TType extends ProtocolCommandType, TSource = string> = {
    readonly [T in TType]: CommandRoute<T, TSource>;
};

/**
 * Open/closed dispatch table for webview → host messages.
 *
 * Replaces the controller's central `switch (message.type)`: adding a webview
 * capability becomes "register one more handler" instead of editing a shared
 * switch. Kept free of `vscode` and logging so handlers stay unit-testable in
 * isolation; the controller call site keeps the received/processed log lines.
 *
 * Multiple handlers per type are supported and run in registration order —
 * `GetBpmnModelerSettingCommand` fans out to settings broadcast plus a
 * script-task resync, and that order must be preserved.
 */
export class WebviewMessageRouter<TSource = string> {
    private readonly handlers = new Map<string, MessageHandler<Command, TSource>[]>();

    private readonly ignoredReasons = new Map<string, string>();

    static fromTable<TType extends ProtocolCommandType, TSource = string>(
        table: CommandTable<TType, TSource>,
    ): WebviewMessageRouter<TSource> {
        const router = new WebviewMessageRouter<TSource>();
        for (const type of Object.keys(table) as TType[]) {
            const route: CommandRoute<TType, TSource> = table[type];
            if ("ignored" in route) {
                router.ignore(type, route.ignored);
            } else {
                for (const handler of route) router.on(type, handler);
            }
        }
        return router;
    }

    /**
     * Registers a handler for a command type. Repeated calls for the same type
     * append; handlers fire in registration order during {@link dispatch}.
     */
    on<TType extends ProtocolCommandType>(
        type: TType,
        handler: MessageHandler<MessageOfType<TType>, TSource>,
    ): this {
        const ignoredReason = this.ignoredReasons.get(type);
        if (ignoredReason !== undefined) {
            throw new Error(`${type} is ignored (${ignoredReason}), so it cannot be handled`);
        }
        // Sound because dispatch only hands a handler messages whose type it was registered for.
        const untypedHandler = handler as MessageHandler<Command, TSource>;
        const existing = this.handlers.get(type);
        if (existing) {
            existing.push(untypedHandler);
        } else {
            this.handlers.set(type, [untypedHandler]);
        }
        return this;
    }

    /**
     * Records a command type this router drops on purpose, so a coverage check
     * can tell it from a type nobody routed. Dispatching it stays a no-op.
     */
    ignore(type: ProtocolCommandType, reason: string): this {
        if (reason.trim() === "") {
            throw new Error(`${type} needs a reason to be ignored`);
        }
        if (this.handlers.has(type)) {
            throw new Error(`${type} is handled, so it cannot be ignored`);
        }
        const ignoredReason = this.ignoredReasons.get(type);
        if (ignoredReason !== undefined) {
            throw new Error(`${type} is already ignored (${ignoredReason})`);
        }
        this.ignoredReasons.set(type, reason);
        return this;
    }

    routeOf(type: ProtocolCommandType): MessageRoute {
        if (this.handlers.has(type)) {
            return { kind: "handled" };
        }
        const reason = this.ignoredReasons.get(type);
        return reason === undefined ? { kind: "unrouted" } : { kind: "ignored", reason };
    }

    /**
     * Runs every handler registered for `message.type` sequentially, awaiting
     * each before the next so ordering-dependent fan-out (e.g. setSettings →
     * setLanguage → resync) stays in registration order. An ignored or unrouted
     * type is a silent no-op; {@link routeOf} tells the two apart.
     */
    async dispatch(message: Command, source: TSource): Promise<void> {
        const handlers = this.handlers.get(message.type);
        if (!handlers) {
            return;
        }
        for (const handler of handlers) {
            await handler(message, source);
        }
    }
}
