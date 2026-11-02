import { StatusBarPort } from "../port/hostPorts";
import { StatusSlot, StatusView } from "../domain/statusView";

export function updateStatusSlot(
    statusBar: StatusBarPort,
    slot: StatusSlot,
    view: StatusView | undefined,
): void {
    if (view) {
        statusBar.show(slot, view);
    } else {
        statusBar.hide(slot);
    }
}
