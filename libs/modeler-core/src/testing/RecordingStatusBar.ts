import { StatusBarPort } from "../kernel/domain/hostPorts";
import { StatusSlot, StatusView } from "../kernel/domain/statusView";

/**
 * Holds what each status-bar item currently shows, as the real adapters do. A
 * transient view stays in {@link views}, since the auto-hide is the hosts' timer.
 */
export class RecordingStatusBar implements StatusBarPort {
    views: Partial<Record<StatusSlot, StatusView>> = {};

    show(slot: StatusSlot, view: StatusView): void {
        this.views = { ...this.views, [slot]: view };
    }

    hide(slot: StatusSlot): void {
        const { [slot]: _hidden, ...shown } = this.views;
        this.views = shown;
    }
}
