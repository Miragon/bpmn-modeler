import type { Query } from "./messages";

interface TypedMessage {
    readonly type: string;
}

/** What a browser preview does with a command, or why it drops it. */
export type PreviewRoute<TCommand, TSession> =
    ((command: TCommand, session: TSession) => void) | { readonly ignored: string };

/**
 * A row per command type of a surface: a command without one fails to compile.
 * Write each drop reason as a plain string literal: Rollup keeps a module-level
 * interpolated template literal, which would ship the table in production.
 */
export type PreviewCommandTable<TCommand extends TypedMessage, TSession> = {
    readonly [TType in TCommand["type"]]: PreviewRoute<
        Extract<TCommand, { type: TType }>,
        TSession
    >;
};

type AnyPreviewRoute = PreviewRoute<never, never>;

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf<TRoute extends AnyPreviewRoute>(
    table: Readonly<Record<string, TRoute>>,
    type: string,
): TRoute {
    if (!Object.prototype.hasOwnProperty.call(table, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return table[type];
}

export function routePreviewCommand<TCommand extends TypedMessage, TSession>(
    table: PreviewCommandTable<NoInfer<TCommand>, NoInfer<TSession>>,
    command: TCommand,
    session: TSession,
): void {
    const route = previewRouteOf<AnyPreviewRoute>(table, command.type);
    if ("ignored" in route) {
        console.debug(`[DEBUG] ${command.type} ignored: ${route.ignored}`, command);
        return;
    }
    // Sound because the table hands each row only commands of its own key's type.
    (route as (command: TCommand, session: TSession) => void)(command, session);
}

/** Hands a preview's answer to the webview as the host would; no answer sends nothing. */
export function replyFromPreview(query: Query | undefined): void {
    if (query) {
        window.dispatchEvent(new MessageEvent("message", { data: query }));
    }
}

export function logPreviewError({ message, stack }: { message: string; stack?: string }): void {
    console.error(stack ? `${message}\n${stack}` : message);
}
