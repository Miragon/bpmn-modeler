import { describeAddOnViewRevealContract } from "@miragon/bpmn-modeler-core/testing";

import { createStdinHandler } from "../../../composition/stdioBinding";
import { METHODS } from "../../../protocol/domain/descriptor";
import { AddOnsRevealResult } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcAddOnViewReveal } from "./RpcAddOnViewReveal";

interface CoreFrame {
    readonly id: number;
    readonly method: string;
}

/**
 * IntelliJ's `AddOnsRouter`: `addOns/reveal` answers on the EDT with what
 * `revealArtifacts` reports, `true` once the BPMN Modeler tool window is active
 * on its Artifacts tab, and `false` when it cannot open the tab.
 */
function intellijArtifactsTab(
    showsView: boolean,
    sendToBridge: (chunk: string) => void,
): (line: string) => void {
    return (line) => {
        const { id, method } = JSON.parse(line) as CoreFrame;
        setTimeout(() => {
            const frame =
                method === METHODS.addOnsReveal
                    ? { id, result: { shown: showsView } satisfies AddOnsRevealResult }
                    : { id, error: `No handler for ${method}` };
            sendToBridge(`${JSON.stringify(frame)}\n`);
        }, 0);
    };
}

describeAddOnViewRevealContract(
    "RpcAddOnViewReveal over a loopback to IntelliJ's Artifacts tab",
    async ({ showsView }) => {
        let fromHost: (chunk: string) => void = () => undefined;
        const rpc = new Rpc(intellijArtifactsTab(showsView, (chunk) => fromHost(chunk)));
        fromHost = createStdinHandler(rpc, (text) => {
            throw new Error(text);
        });
        const rows: (readonly string[])[] = [];
        const view = new RpcAddOnViewReveal(rpc, () => undefined);
        view.connect({ reveal: (addOnIds) => rows.push(addOnIds) });
        return { view, shownRows: () => rows };
    },
);
