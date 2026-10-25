import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestHost } from "../../testing";
import { DeploymentStatusService } from "../service/DeploymentStatusService";
import { DeploymentStatusParticipant } from "./DeploymentStatusParticipant";

// The real status service needs deployment targets and ledger state that are
// irrelevant to focus ownership; casting through a `Pick` keeps the stub typed.
function createParticipant() {
    const status = { refresh: vi.fn(), hide: vi.fn() };
    const participant = new DeploymentStatusParticipant(
        status as Pick<DeploymentStatusService, "refresh" | "hide"> as DeploymentStatusService,
    );
    return { host: createTestHost(), status, participant };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("deployment status focus ownership", () => {
    it("cancels a pending edit refresh on blur and ignores background edits", async () => {
        const { host, status, participant } = createParticipant();
        const a = await host.openSession("/work/a.bpmn", [participant]);
        status.refresh.mockClear();
        a.changeDocument("<edit-1/>");
        a.loseFocus();
        a.changeDocument("<edit-2/>");
        vi.advanceTimersByTime(301);
        expect(status.refresh).not.toHaveBeenCalled();
        expect(status.hide).toHaveBeenCalledOnce();
    });

    it("keeps the new editor's status when an old editor blurs or closes later", async () => {
        const { host, status, participant } = createParticipant();
        const a = await host.openSession("/work/a.bpmn", [participant]);
        const b = await host.openSession("/work/b.bpmn", [participant], { focused: false });
        a.changeDocument("<edit/>");
        b.becomeActive();
        a.loseFocus();
        a.dispose();
        vi.advanceTimersByTime(301);
        expect(status.refresh).toHaveBeenLastCalledWith(b.id);
        expect(status.hide).not.toHaveBeenCalled();
    });

    it("coalesces active edits and cancels the timer on disposal", async () => {
        const { host, status, participant } = createParticipant();
        const a = await host.openSession("/work/a.bpmn", [participant]);
        status.refresh.mockClear();
        a.changeDocument("<edit-1/>");
        a.changeDocument("<edit-2/>");
        vi.advanceTimersByTime(300);
        expect(status.refresh).toHaveBeenCalledExactlyOnceWith(a.id);
        a.changeDocument("<edit-3/>");
        a.dispose();
        vi.advanceTimersByTime(300);
        expect(status.refresh).toHaveBeenCalledOnce();
        expect(status.hide).toHaveBeenCalledOnce();
    });
});
