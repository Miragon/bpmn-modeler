import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installHostEditorActions } from "./hostEditorActions";

const trigger = vi.fn<(action: "undo" | "redo") => void>();

beforeEach(() => {
    trigger.mockReset();
    document.body.innerHTML = "";
    installHostEditorActions((action) => trigger(action));
});

afterEach(() => {
    delete window.__modelerTriggerEditorAction;
});

describe("installHostEditorActions", () => {
    it("runs undo when no text surface is focused", () => {
        window.__modelerTriggerEditorAction!("undo");
        expect(trigger).toHaveBeenCalledWith("undo");
    });

    it("runs redo when no text surface is focused", () => {
        window.__modelerTriggerEditorAction!("redo");
        expect(trigger).toHaveBeenCalledWith("redo");
    });

    it("skips while an input owns the caret so the diagram isn't clobbered", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        window.__modelerTriggerEditorAction!("undo");

        expect(trigger).not.toHaveBeenCalled();
    });

    it("skips while a contenteditable surface owns the caret", () => {
        const editable = document.createElement("div");
        editable.contentEditable = "true";
        editable.tabIndex = 0;
        document.body.appendChild(editable);
        editable.focus();

        window.__modelerTriggerEditorAction!("undo");

        expect(trigger).not.toHaveBeenCalled();
    });
});
