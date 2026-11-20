import type { ProtocolCommand } from "./protocolMessageMap";

/** What a browser preview does with a command, or why it drops it. */
export type PreviewRoute<TCommand extends ProtocolCommand, TSession> =
    ((command: TCommand, session: TSession) => void) | { readonly ignored: string };

/** A row per command of a surface: a command without one fails to compile. */
export type PreviewCommandTable<TCommand extends ProtocolCommand, TSession> = {
    readonly [Type in TCommand["type"]]: PreviewRoute<Extract<TCommand, { type: Type }>, TSession>;
};

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf<TCommand extends ProtocolCommand, TSession>(
    table: PreviewCommandTable<TCommand, TSession>,
    type: string,
): PreviewRoute<TCommand, TSession> {
    if (!Object.prototype.hasOwnProperty.call(table, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    // Sound because the router hands each row only commands of its own key's type.
    return table[type as TCommand["type"]] as PreviewRoute<TCommand, TSession>;
}

export function routePreviewCommand<TCommand extends ProtocolCommand, TSession>(
    table: PreviewCommandTable<TCommand, TSession>,
    command: TCommand,
    session: TSession,
): void {
    const route = previewRouteOf(table, command.type);
    if ("ignored" in route) {
        console.debug(`[DEBUG] ${command.type} ignored: ${route.ignored}`, command);
        return;
    }
    route(command, session);
}
