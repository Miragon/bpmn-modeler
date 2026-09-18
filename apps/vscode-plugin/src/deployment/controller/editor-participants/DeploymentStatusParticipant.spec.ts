import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeploymentStatusParticipant } from "./DeploymentStatusParticipant";
import type { EditorSessionContext } from "../../../modeler/editor-session/EditorSessionParticipant";

function session(editorId: string, active: boolean) {
    let viewState = () => {};
    let dispose = () => {};
    let change: Parameters<EditorSessionContext["onDocumentChange"]>[0] = () => {};
    const panel = {
        active,
        onDidChangeViewState: (callback: () => void) => {
            viewState = callback;
            return { dispose: () => {} };
        },
    };
    const context = {
        editorId,
        panel,
        addDisposable: () => {},
        onDispose: (callback: () => void) => {
            dispose = callback;
        },
        onDocumentChange: (callback: typeof change) => {
            change = callback;
        },
    } as unknown as EditorSessionContext;
    return {
        context,
        focus: (active: boolean) => {
            panel.active = active;
            viewState();
        },
        dispose: () => dispose(),
        edit: () =>
            change({ hasContentChanges: () => true, documentUriString: () => editorId } as never),
    };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("deployment status focus ownership", () => {
    it("cancels a pending edit refresh on blur and ignores background edits", () => {
        const status = { refresh: vi.fn(), hide: vi.fn() };
        const participant = new DeploymentStatusParticipant(status as never);
        const a = session("a", true);
        participant.onResolve(a.context);
        status.refresh.mockClear();
        a.edit();
        a.focus(false);
        a.edit();
        vi.advanceTimersByTime(301);
        expect(status.refresh).not.toHaveBeenCalled();
        expect(status.hide).toHaveBeenCalledOnce();
    });

    it("keeps the new editor's status when an old editor blurs or closes later", () => {
        const status = { refresh: vi.fn(), hide: vi.fn() };
        const participant = new DeploymentStatusParticipant(status as never);
        const a = session("a", true);
        const b = session("b", false);
        participant.onResolve(a.context);
        participant.onResolve(b.context);
        a.edit();
        b.focus(true);
        a.focus(false);
        a.dispose();
        vi.advanceTimersByTime(301);
        expect(status.refresh).toHaveBeenLastCalledWith("b");
        expect(status.hide).not.toHaveBeenCalled();
    });

    it("coalesces active edits and cancels the timer on disposal", () => {
        const status = { refresh: vi.fn(), hide: vi.fn() };
        const participant = new DeploymentStatusParticipant(status as never);
        const a = session("a", true);
        participant.onResolve(a.context);
        status.refresh.mockClear();
        a.edit();
        a.edit();
        vi.advanceTimersByTime(300);
        expect(status.refresh).toHaveBeenCalledExactlyOnceWith("a");
        a.edit();
        a.dispose();
        vi.advanceTimersByTime(300);
        expect(status.refresh).toHaveBeenCalledOnce();
        expect(status.hide).toHaveBeenCalledOnce();
    });
});
