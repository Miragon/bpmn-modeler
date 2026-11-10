import { AddOnsFeature, AddOnViewRevealPort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { AddOnsRevealResult, EmptyParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";

/**
 * Asks the IntelliJ host to open its add-ons view; the core then delivers the
 * rows to the view through the panel it attached, so they never ride the wire.
 */
export class RpcAddOnViewReveal implements AddOnViewRevealPort {
    private addOns?: Pick<AddOnsFeature, "reveal">;

    constructor(
        private readonly rpc: Pick<Rpc, "request">,
        private readonly log: (message: string) => void,
    ) {}

    /** Late-bound: the reviews that reveal are built before the catalog they reveal in. */
    connect(addOns: Pick<AddOnsFeature, "reveal">): void {
        this.addOns = addOns;
    }

    async reveal(addOnIds: readonly string[]): Promise<boolean> {
        const addOns = this.addOns;
        if (addOns === undefined) return false;
        const shown = await this.rpc.request(METHODS.addOnsReveal, {} satisfies EmptyParams).then(
            isShown,
            (error: unknown) => {
                this.log(`The add-ons view did not open: ${String(error)}`);
                return false;
            },
        );
        if (shown) addOns.reveal(addOnIds);
        return shown;
    }
}

function isShown(reply: unknown): boolean {
    return (
        typeof reply === "object" &&
        reply !== null &&
        (reply as Partial<AddOnsRevealResult>).shown === true
    );
}
