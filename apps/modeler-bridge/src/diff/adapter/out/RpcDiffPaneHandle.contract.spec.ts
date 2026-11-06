import { describeDiffPaneContract } from "@miragon/bpmn-modeler-core/testing";

import { METHODS } from "../../../protocol/domain/descriptor";
import { DiffPostMessageParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcDiffPaneHandle } from "./RpcDiffPaneHandle";

interface Frame {
    readonly method?: string;
    readonly params?: unknown;
}

/**
 * IntelliJ's diff browsers, routed as `DiffRouter.kt` routes them: `openDiff`
 * registers each pane's browser under its URI before it sends `diff/open`, and
 * `diff/postMessage` hands the message, serialized by Gson, to the browser of
 * its `paneUri` on the host's own thread. A URI with no browser drops the post.
 */
class IntelliJDiffBrowsers {
    readonly rpc = new Rpc((line) => this.receive(JSON.parse(line) as Frame));
    private readonly browsers = new Map<string, unknown[]>();

    /** Registers a pane's browser; the returned list fills with what its page receives. */
    open(paneUri: string): readonly unknown[] {
        const received: unknown[] = [];
        this.browsers.set(paneUri, received);
        return received;
    }

    private receive(frame: Frame): void {
        if (frame.method !== METHODS.diffPostMessage) {
            throw new Error(`The diff loopback does not answer ${frame.method}`);
        }
        const { paneUri, message } = frame.params as DiffPostMessageParams;
        const json = JSON.stringify(message);
        setTimeout(() => this.browsers.get(paneUri)?.push(JSON.parse(json)), 0);
    }
}

describeDiffPaneContract("RpcDiffPaneHandle", (sides) => {
    const host = new IntelliJDiffBrowsers();
    const received = { before: host.open(sides.before.uri), after: host.open(sides.after.uri) };
    // `diffHandlers` seeds each pane with the content `diff/open` carries.
    return {
        before: new RpcDiffPaneHandle(sides.before.uri, sides.before.text, host.rpc),
        after: new RpcDiffPaneHandle(sides.after.uri, sides.after.text, host.rpc),
        receivedBy: (side) => received[side],
    };
});
