import { ElementIdReviewPort, ElementIdReviewView } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../../protocol/domain/descriptor";
import { EmptyParams, ElementIdReviewShowParams } from "../../../../protocol/domain/types";

/**
 * IntelliJ shows the element ID review in its own tool window, drawn from the
 * view the core sends; the window's actions come back as `elementIdReview/*`.
 */
export class RpcElementIdReview implements ElementIdReviewPort {
    constructor(private readonly rpc: Rpc) {}

    show(view: ElementIdReviewView): void {
        this.rpc.notify(METHODS.elementIdReviewShow, { view } satisfies ElementIdReviewShowParams);
    }

    close(): void {
        this.rpc.notify(METHODS.elementIdReviewClose, {} satisfies EmptyParams);
    }
}
