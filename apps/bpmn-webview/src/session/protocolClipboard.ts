import type { ClipboardBridge, ClipboardOptions } from "@miragon/bpmn-modeler";
import {
    type ClipboardQuery,
    type Command,
    GetClipboardCommand,
    GetTextClipboardCommand,
    HOST_REPLY_TIMEOUT_MS,
    LogWarningCommand,
    SetClipboardCommand,
    SetTextClipboardCommand,
    type TextClipboardQuery,
    createResolver,
} from "@miragon/bpmn-modeler-shared";

import type { HostChannel } from "./hostChannel";

interface ClipboardReplyHandlers {
    ClipboardQuery(reply: ClipboardQuery): void;
    TextClipboardQuery(reply: TextClipboardQuery): void;
}

export interface ResolvedClipboard {
    /** `undefined` leaves copy/paste to the browser clipboard. */
    readonly options: ClipboardOptions | undefined;
    readonly handlers: ClipboardReplyHandlers;
}

// Only the protocol tier asks the host, so any other tier has no paste awaiting a reply.
const ignoreClipboardReplies: ClipboardReplyHandlers = {
    ClipboardQuery: () => {},
    TextClipboardQuery: () => {},
};

/**
 * Picks the clipboard the editable surfaces build their copy/paste modules and
 * the contenteditable/FEEL polyfill from:
 *
 * - `"native"`: the browser clipboard, so bpmn-js's NativeCopyPaste stays in charge.
 * - `{ bridge }`: the caller's override, passed through unchanged.
 * - `undefined`: the browser clipboard in the development preview, otherwise the host.
 */
export function resolveClipboard(
    injected: ClipboardOptions | "native" | undefined,
    { isDevelopment, host }: { isDevelopment: boolean; host: HostChannel },
): ResolvedClipboard {
    if (injected === "native") {
        return { options: undefined, handlers: ignoreClipboardReplies };
    }
    if (injected) {
        return { options: injected, handlers: ignoreClipboardReplies };
    }
    if (isDevelopment) {
        return { options: undefined, handlers: ignoreClipboardReplies };
    }
    return createProtocolClipboard(host);
}

function createProtocolClipboard(host: HostChannel): ResolvedClipboard {
    const elementChannel = createHostClipboardChannel<ClipboardQuery>(host, {
        request: () => new GetClipboardCommand(),
        write: (text) => new SetClipboardCommand(text),
    });
    const textChannel = createHostClipboardChannel<TextClipboardQuery>(host, {
        request: () => new GetTextClipboardCommand(),
        write: (text) => new SetTextClipboardCommand(text),
    });
    return {
        // Two channels keep the element and label/FEEL clipboards apart; the
        // package installs the contenteditable polyfill off the `text` bridge.
        options: { bridge: elementChannel.bridge, text: textChannel.bridge },
        handlers: {
            ClipboardQuery: (reply) => elementChannel.receive(reply),
            TextClipboardQuery: (reply) => textChannel.receive(reply),
        },
    };
}

function createHostClipboardChannel<Reply extends { text: string | undefined }>(
    host: HostChannel,
    commands: { request(): Command; write(text: string): Command },
): { bridge: ClipboardBridge; receive(reply: Reply): void } {
    let pendingReply = createResolver<Reply>();

    function pastedText(reply: Reply | undefined): string {
        if (!reply) {
            host.postMessage(
                new LogWarningCommand("No clipboard reply from the host; paste skipped"),
            );
            return "";
        }
        return reply.text ?? "";
    }

    return {
        bridge: {
            requestClipboard: async () => {
                pendingReply = createResolver<Reply>();
                host.postMessage(commands.request());
                return pastedText(await pendingReply.wait(HOST_REPLY_TIMEOUT_MS));
            },
            writeClipboard: (text) => host.postMessage(commands.write(text)),
        },
        receive: (reply) => pendingReply.done(reply),
    };
}
