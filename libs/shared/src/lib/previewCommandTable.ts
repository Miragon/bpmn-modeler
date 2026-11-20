/** What a browser preview does with a command, or why it drops it. */
export type PreviewRoute<TCommand, TSession> =
    ((command: TCommand, session: TSession) => void) | { readonly ignored: string };

/**
 * A row per command type of a surface: a command without one fails to compile.
 * A reason is a plain string literal: an interpolated template literal keeps
 * the module-level table in the production bundle.
 */
export type PreviewCommandTable<TCommand extends { readonly type: string }, TSession> = {
    readonly [TType in TCommand["type"]]: PreviewRoute<
        Extract<TCommand, { type: TType }>,
        TSession
    >;
};

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf<TCommand extends { readonly type: string }, TSession>(
    table: PreviewCommandTable<TCommand, TSession>,
    type: string,
): PreviewRoute<TCommand, TSession> {
    if (!Object.prototype.hasOwnProperty.call(table, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return table[type as TCommand["type"]] as PreviewRoute<TCommand, TSession>;
}

export function routePreviewCommand<TCommand extends { readonly type: string }, TSession>(
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
