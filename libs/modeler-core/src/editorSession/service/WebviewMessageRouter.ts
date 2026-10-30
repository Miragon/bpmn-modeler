import { Command, MessageOfType, ProtocolCommandType } from "@miragon/bpmn-modeler-shared";

/**
 * Handles a single webview command, narrowed to the command type it was
 * registered for, together with the originating editor id.
 */
export type MessageHandler<TMessage extends Command = Command> = (
    message: TMessage,
    editorId: string,
) => void | Promise<void>;

export type MessageRoute =
    | { readonly kind: "handled" }
    | { readonly kind: "ignored"; readonly reason: string }
    | { readonly kind: "unrouted" };

/** A command's handlers in run order, or the reason its editor drops it. */
export type CommandRoute<TType extends ProtocolCommandType> =
    | readonly [MessageHandler<MessageOfType<TType>>, ...MessageHandler<MessageOfType<TType>>[]]
    | { readonly ignored: string };

/** Routes for a closed set of command types: a type without an entry fails to compile. */
export type CommandTable<TType extends ProtocolCommandType> = {
    readonly [T in TType]: CommandRoute<T>;
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
export class WebviewMessageRouter {
    private readonly handlers = new Map<string, MessageHandler<Command>[]>();

    private readonly ignoredReasons = new Map<string, string>();

    static fromTable<TType extends ProtocolCommandType>(
        table: CommandTable<TType>,
    ): WebviewMessageRouter {
        const router = new WebviewMessageRouter();
        for (const type of Object.keys(table) as TType[]) {
            const route: CommandRoute<TType> = table[type];
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
        handler: MessageHandler<MessageOfType<TType>>,
    ): this {
        const ignoredReason = this.ignoredReasons.get(type);
        if (ignoredReason !== undefined) {
            throw new Error(`${type} is ignored (${ignoredReason}), so it cannot be handled`);
        }
        // Sound because dispatch only hands a handler messages whose type it was registered for.
        const untypedHandler = handler as MessageHandler<Command>;
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
    async dispatch(message: Command, editorId: string): Promise<void> {
        const handlers = this.handlers.get(message.type);
        if (!handlers) {
            return;
        }
        for (const handler of handlers) {
            await handler(message, editorId);
        }
    }
}
