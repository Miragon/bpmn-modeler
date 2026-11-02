import { StatusBarPort, StatusSlot, StatusView } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { StatusBarUpdateParams } from "../../../protocol/domain/types";

/**
 * Sends each status slot's view to the host, which shows every slot in its own
 * `StatusBarWidget`. The core decides *what* a slot shows; the host only places
 * it.
 */
export class RpcStatusBar implements StatusBarPort {
    constructor(private readonly rpc: Rpc) {}

    show(slot: StatusSlot, view: StatusView): void {
        this.rpc.notify(METHODS.statusBarUpdate, { slot, view } satisfies StatusBarUpdateParams);
    }

    hide(slot: StatusSlot): void {
        this.rpc.notify(METHODS.statusBarUpdate, {
            slot,
            view: null,
        } satisfies StatusBarUpdateParams);
    }
}
