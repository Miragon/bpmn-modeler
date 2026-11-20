import type { MessageOfType, ProtocolCommandType } from "./protocolMessageMap";

/** What a browser preview does with a command, or why it drops it. */
export type PreviewRoute<TType extends ProtocolCommandType, TSession> =
    ((command: MessageOfType<TType>, session: TSession) => void) | { readonly ignored: string };

/** A row per command a webview posts: a command without one fails to compile. */
export type PreviewCommandTable<TType extends ProtocolCommandType, TSession> = {
    readonly [Type in TType]: PreviewRoute<Type, TSession>;
};

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf<TType extends ProtocolCommandType, TSession>(
    table: PreviewCommandTable<TType, TSession>,
    type: string,
): PreviewRoute<TType, TSession> {
    if (!Object.prototype.hasOwnProperty.call(table, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return table[type as TType] as PreviewRoute<TType, TSession>;
}

export function routePreviewCommand<TType extends ProtocolCommandType, TSession>(
    table: PreviewCommandTable<TType, TSession>,
    command: MessageOfType<TType>,
    session: TSession,
    logPrefix: string,
): void {
    // TypeScript cannot see the shared `type` through a still-generic Extract.
    const { type } = command as { readonly type: TType };
    const route = previewRouteOf(table, type);
    if ("ignored" in route) {
        console.debug(`${logPrefix} ${type} ignored: ${route.ignored}`, command);
        return;
    }
    // Sound because the table hands each row only commands of its own key's type.
    (route as (command: MessageOfType<TType>, session: TSession) => void)(command, session);
}
