import { Command } from "@miragon/bpmn-modeler-shared";

/**
 * Handles a single webview command. Receives the raw {@link Command} (which it
 * casts to its concrete type internally) and the originating editor id.
 */
export type MessageHandler = (message: Command, editorId: string) => void | Promise<void>;

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
    private readonly handlers = new Map<string, MessageHandler[]>();

    /**
     * Registers a handler for a command type. Repeated calls for the same type
     * append; handlers fire in registration order during {@link dispatch}.
     */
    on(type: string, handler: MessageHandler): this {
        const existing = this.handlers.get(type);
        if (existing) {
            existing.push(handler);
        } else {
            this.handlers.set(type, [handler]);
        }
        return this;
    }

    /**
     * Runs every handler registered for `message.type` sequentially, awaiting
     * each before the next so ordering-dependent fan-out (e.g. setSettings →
     * setLanguage → resync) stays in registration order. An unknown type is a
     * silent no-op.
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
