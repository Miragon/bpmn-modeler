import { ElementXmlDiff, ElementXmlDiffView } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { ElementXmlDiffShowParams } from "../../../protocol/domain/diffProtocol";
import { Rpc } from "../../../transport/adapter/out/Rpc";

/**
 * The host's element XML diffs, over RPC. IntelliJ shows each inside the
 * diagram diff of `paneUri`, so the host decides whether a refresh still has
 * a view to replace, and reports a close by the user as `elementXmlDiff/closed`.
 */
export class RpcElementXmlDiffView implements ElementXmlDiffView {
    constructor(private readonly rpc: Rpc) {}

    async show(diff: ElementXmlDiff): Promise<void> {
        this.rpc.notify(METHODS.elementXmlDiffShow, shownParams(diff));
    }

    async refresh(diff: ElementXmlDiff): Promise<void> {
        this.rpc.notify(METHODS.elementXmlDiffRefresh, shownParams(diff));
    }

    async close(diffKey: string): Promise<void> {
        this.rpc.notify(METHODS.elementXmlDiffClose, { diffKey });
    }
}

function shownParams({ diffKey, paneUri, title, before, after }: ElementXmlDiff): ElementXmlDiffShowParams {
    return { diffKey, paneUri, title, before, after };
}
