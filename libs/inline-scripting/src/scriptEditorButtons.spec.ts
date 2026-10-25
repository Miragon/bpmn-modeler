import { afterEach, describe, expect, it, vi } from "vitest";

import type { Element as BpmnElement } from "./bpmnTypes";
import { ScriptEditorButtons } from "./scriptEditorButtons";

// ---------------------------------------------------------------------------
// Fixture markup — mirrors the class names and ids the upstream C7 properties
// panel renders for the Script group and the listener list items.
// ---------------------------------------------------------------------------

const SCRIPT_GROUP = `
    <div class="bio-properties-panel-group" data-group-id="group-CamundaPlatform__Script">
        <div class="bio-properties-panel-group-header">
            <div class="bio-properties-panel-group-header-title">Script</div>
            <div class="bio-properties-panel-group-header-buttons">
                <button type="button" class="bio-properties-panel-arrow"></button>
            </div>
        </div>
    </div>`;

function listenerRow(entryId: string, { withRemoveButton = true } = {}): string {
    const removeButton = withRemoveButton
        ? `<button type="button" class="bio-properties-panel-remove-entry"></button>`
        : "";
    return `
    <div class="bio-properties-panel-collapsible-entry" data-entry-id="${entryId}">
        <div class="bio-properties-panel-collapsible-entry-header">
            <div class="bio-properties-panel-collapsible-entry-header-title">Listener</div>
            ${removeButton}
        </div>
        <div class="bio-properties-panel-collapsible-entry-entries">
            <div class="bio-properties-panel-entry" data-entry-id="${entryId}-eventType"></div>
        </div>
    </div>`;
}

function panelRoot(markup = "", id?: string): HTMLElement {
    const root = document.createElement("div");
    if (id) {
        root.id = id;
    }
    root.innerHTML = markup;
    document.body.appendChild(root);
    return root;
}

function build(panelRootElement: HTMLElement | null, selected: BpmnElement[] = []) {
    const listeners = new Map<string, () => void>();
    const eventBus = {
        on: (event: string, callback: () => void) => listeners.set(event, callback),
    };
    const selection = { get: () => selected };
    const opener = { openScriptTask: vi.fn(() => true), openListener: vi.fn(() => true) };
    const injector = {
        get: (name: string) => (name === "propertiesPanelRoot" ? panelRootElement : undefined),
    };

    new ScriptEditorButtons(eventBus, selection, opener as never, injector);

    return { opener, destroyDiagram: () => listeners.get("diagram.destroy")?.() };
}

function editorButtonsIn(container: ParentNode): HTMLButtonElement[] {
    return Array.from(container.querySelectorAll<HTMLButtonElement>(".script-editor-button"));
}

function rowHeader(root: ParentNode, entryId: string): HTMLElement {
    return root.querySelector<HTMLElement>(
        `[data-entry-id="${entryId}"] > .bio-properties-panel-collapsible-entry-header`,
    )!;
}

const flushMutations = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
    document.body.innerHTML = "";
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ScriptEditorButtons", () => {
    describe("Script group header", () => {
        it("puts one open-in-editor button first in the header buttons", () => {
            const root = panelRoot(SCRIPT_GROUP);

            build(root);

            const headerButtons = root.querySelector(".bio-properties-panel-group-header-buttons")!;
            const [button] = editorButtonsIn(headerButtons);
            expect(editorButtonsIn(root)).toHaveLength(1);
            expect(headerButtons.firstElementChild).toBe(button);
            expect(button.type).toBe("button");
            expect(button.title).toBe("Open script in editor");
        });

        it("opens the selected script task without toggling the group", () => {
            const root = panelRoot(SCRIPT_GROUP);
            const scriptTask = { id: "Task_1", businessObject: { $type: "bpmn:ScriptTask" } };
            const { opener } = build(root, [scriptTask]);
            const toggleGroup = vi.fn();
            root.querySelector(".bio-properties-panel-group-header")!.addEventListener(
                "click",
                toggleGroup,
            );

            editorButtonsIn(root)[0].click();

            expect(opener.openScriptTask).toHaveBeenCalledExactlyOnceWith(scriptTask);
            expect(toggleGroup).not.toHaveBeenCalled();
        });

        it("does nothing when clicked with an empty selection", () => {
            const root = panelRoot(SCRIPT_GROUP);
            const { opener } = build(root, []);

            editorButtonsIn(root)[0].click();

            expect(opener.openScriptTask).not.toHaveBeenCalled();
        });
    });

    describe("listener rows", () => {
        it("adds one button per listener row, just before the remove button", () => {
            const root = panelRoot(
                listenerRow("Task-1-executionListener-0") + listenerRow("Task-1-taskListener-1"),
            );

            build(root);

            for (const entryId of ["Task-1-executionListener-0", "Task-1-taskListener-1"]) {
                const header = rowHeader(root, entryId);
                const [button] = editorButtonsIn(header);
                expect(editorButtonsIn(header)).toHaveLength(1);
                expect(button.nextElementSibling?.classList).toContain(
                    "bio-properties-panel-remove-entry",
                );
            }
            expect(editorButtonsIn(root)).toHaveLength(2);
        });

        it("appends the button when the row has no remove button (readonly panel)", () => {
            const root = panelRoot(
                listenerRow("Task_1-executionListener-0", { withRemoveButton: false }),
            );

            build(root);

            const header = rowHeader(root, "Task_1-executionListener-0");
            expect(header.lastElementChild).toBe(editorButtonsIn(header)[0]);
        });

        it("opens the listener the row addresses at click time, without collapsing it", () => {
            const root = panelRoot(listenerRow("Task-1-executionListener-0"));
            const { opener } = build(root);
            const toggleRow = vi.fn();
            const header = rowHeader(root, "Task-1-executionListener-0");
            header.addEventListener("click", toggleRow);
            const [button] = editorButtonsIn(header);

            button.click();
            // The panel re-renders rows in place when listeners are reordered.
            header.parentElement!.setAttribute("data-entry-id", "Task-1-taskListener-12");
            button.click();

            expect(opener.openListener.mock.calls).toEqual([
                ["Task-1", "executionListener", 0],
                ["Task-1", "taskListener", 12],
            ]);
            expect(toggleRow).not.toHaveBeenCalled();
        });
    });

    describe("panel observation", () => {
        it("decorates rows and groups rendered after construction", async () => {
            const root = panelRoot();
            build(root);

            root.insertAdjacentHTML(
                "beforeend",
                SCRIPT_GROUP + listenerRow("Task_1-executionListener-0"),
            );
            await flushMutations();

            expect(editorButtonsIn(root)).toHaveLength(2);
        });

        it("does not inject a second button when the panel re-renders around it", async () => {
            const root = panelRoot(SCRIPT_GROUP + listenerRow("Task_1-executionListener-0"));
            build(root);

            root.appendChild(document.createElement("div"));
            await flushMutations();

            expect(editorButtonsIn(root)).toHaveLength(2);
        });

        it("stops decorating once the diagram is destroyed", async () => {
            const root = panelRoot();
            const { destroyDiagram } = build(root);

            destroyDiagram();
            root.insertAdjacentHTML("beforeend", listenerRow("Task_1-executionListener-0"));
            await flushMutations();

            expect(editorButtonsIn(root)).toHaveLength(0);
        });
    });

    describe("panel root resolution", () => {
        it("prefers the registered panel root over #js-properties-panel", () => {
            const legacyRoot = panelRoot(SCRIPT_GROUP, "js-properties-panel");
            const registeredRoot = panelRoot(SCRIPT_GROUP);

            build(registeredRoot);

            expect(editorButtonsIn(registeredRoot)).toHaveLength(1);
            expect(editorButtonsIn(legacyRoot)).toHaveLength(0);
        });

        it("falls back to #js-properties-panel when no root is registered", () => {
            const legacyRoot = panelRoot(SCRIPT_GROUP, "js-properties-panel");

            build(null);

            expect(editorButtonsIn(legacyRoot)).toHaveLength(1);
        });

        it("stays inert when there is no panel at all", () => {
            expect(() => build(null)).not.toThrow();
        });

        it("routes clicks to the modeler that owns the panel when two share a page", async () => {
            const firstRoot = panelRoot();
            const secondRoot = panelRoot();
            const first = build(firstRoot);
            const second = build(secondRoot);

            firstRoot.insertAdjacentHTML("beforeend", listenerRow("Task_1-executionListener-0"));
            await flushMutations();
            editorButtonsIn(firstRoot)[0].click();

            expect(editorButtonsIn(secondRoot)).toHaveLength(0);
            expect(first.opener.openListener).toHaveBeenCalledOnce();
            expect(second.opener.openListener).not.toHaveBeenCalled();
        });
    });
});
