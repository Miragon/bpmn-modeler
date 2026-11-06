import {
    type Command,
    LogErrorCommand,
    type MessageOfType,
    type Query,
} from "@miragon/bpmn-modeler-shared";

import { MessageGate } from "../../domain/messageGate";
import { receiveErrorPrefix } from "../../domain/receiveErrorPrefix";
import { admitSessionMessage, type SessionMessageType } from "../../domain/sessionMessageAdmission";
import type { ErrorLogChannel, HostChannel } from "../../port/hostChannel";

export type HostMessage = Query | Command;

export type SessionHostMessages = { [Type in SessionMessageType]: MessageOfType<Type> };

/** DiffMode answers the diff queries on its own listener. */
export type DiffPaneHostMessages = { LanguageQuery: MessageOfType<"LanguageQuery"> };

// The router finds a handler by the message's `type`, so each key must be that type.
type KeyedByType<Messages> = { readonly [Type in keyof Messages]: { readonly type: Type } };

/** Requires a handler for every key, so a table that misses a message type fails to compile. */
export type HostMessageHandlers<Messages> = {
    readonly [Type in keyof Messages]: (message: Messages[Type]) => void | Promise<void>;
};

type HostMessageRoute = (message: HostMessage) => Promise<void>;

type AnyHostMessageHandler = (message: HostMessage) => void | Promise<void>;

/** A type without a handler is ignored; a failing handler is reported to the host instead of rejecting. */
export function createHostMessageRouter<Messages extends KeyedByType<Messages>>(
    host: ErrorLogChannel,
    handlers: HostMessageHandlers<Messages>,
): HostMessageRoute {
    // A Map, not the table itself, so a `type` naming an Object.prototype member finds no handler.
    const handlerByType = new Map(Object.entries(handlers) as [string, AnyHostMessageHandler][]);
    return async (message) => {
        const handle = handlerByType.get(message.type);
        if (!handle) {
            return;
        }
        try {
            await handle(message);
        } catch (error) {
            host.postMessage(
                new LogErrorCommand(receiveErrorPrefix(message.type) + failureMessage(error)),
            );
        }
    };
}

function failureMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && "message" in error) {
        return String(error.message);
    }
    return String(error);
}

interface EngineReloadStatus {
    readonly isReloadingForEngine: boolean;
}

interface SessionMessageRouter {
    readonly route: HostMessageRoute;
    /** Replays the held import-bound messages in arrival order and lets later ones straight through. */
    openImportBound(): void;
    discardImportBound(): void;
}

export function createSessionMessageRouter(
    host: HostChannel,
    handlers: HostMessageHandlers<SessionHostMessages>,
    engineReload: EngineReloadStatus,
): SessionMessageRouter {
    const dispatch = createHostMessageRouter<SessionHostMessages>(host, handlers);
    const importBoundMessages = new MessageGate<HostMessage>((message) => {
        void route(message);
    });

    async function route(message: HostMessage): Promise<void> {
        const admission = admitSessionMessage(message.type, {
            engineReloading: engineReload.isReloadingForEngine,
        });
        if (admission === "drop") {
            return;
        }
        if (admission === "importBound" && importBoundMessages.hold(message)) {
            return;
        }
        await dispatch(message);
    }

    return {
        route,
        openImportBound: () => importBoundMessages.open(),
        discardImportBound: () => importBoundMessages.discard(),
    };
}
