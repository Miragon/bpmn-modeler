import type { FormPreviewReply } from "@miragon/bpmn-modeler-shared";
import { ensureArrayToSorted, ensureUrlCanParse } from "@miragon/bpmn-modeler-shared";

import { parsePreviewSchema } from "./formPreviewSchema";
import "@bpmn-io/form-js-viewer/dist/assets/form-js.css";
import "./formPreview.css";

export interface PreviewViewer {
    importSchema(schema: Record<string, unknown>): Promise<unknown>;
    destroy(): void;
}

export type PreviewViewerFactory = (container: HTMLElement) => Promise<PreviewViewer>;

async function createViewer(container: HTMLElement): Promise<PreviewViewer> {
    ensureArrayToSorted();
    ensureUrlCanParse();
    const { Form } = await import("@bpmn-io/form-js-viewer");
    return new Form({ container, properties: { readOnly: true } });
}

export function createFormPreview(
    read: (id: string) => Promise<FormPreviewReply>,
    create: PreviewViewerFactory = createViewer,
) {
    let dialog: HTMLDialogElement | undefined;
    let currentViewer: PreviewViewer | undefined;
    let generation = 0;
    let returnFocus: HTMLElement | undefined;

    function close(): void {
        generation++;
        currentViewer?.destroy();
        currentViewer = undefined;
        dialog?.remove();
        dialog = undefined;
        if (returnFocus?.isConnected) returnFocus.focus();
    }

    function open(id: string): void {
        close();
        returnFocus =
            document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
        const panel = document.createElement("dialog");
        dialog = panel;
        panel.className = "linked-form-preview";
        panel.setAttribute("aria-label", "Linked form preview");
        panel.innerHTML =
            '<header><h2>Linked form preview</h2><button type="button" data-refresh>Refresh</button><button type="button" data-close autofocus>Close</button></header><p>Read-only preview of the saved local form.</p><p role="status" aria-live="polite"></p><div class="linked-form-preview-content"></div>';
        const status = panel.querySelector<HTMLElement>('[role="status"]')!;
        const content = panel.querySelector<HTMLElement>(".linked-form-preview-content")!;
        const refresh = panel.querySelector<HTMLButtonElement>("[data-refresh]")!;

        async function load(): Promise<void> {
            const token = ++generation;
            currentViewer?.destroy();
            currentViewer = undefined;
            content.replaceChildren();
            status.textContent = "Loading saved form…";
            content.setAttribute("aria-busy", "true");
            let viewer: PreviewViewer | undefined;
            try {
                const result = await read(id);
                if (token !== generation) return;
                if (result.kind === "unavailable") throw new Error(result.message);
                const schema = parsePreviewSchema(result.content);
                const mount = document.createElement("div");
                // Keep the form readable to assistive technology without allowing links or submit actions.
                for (const type of ["click", "auxclick", "submit"]) {
                    mount.addEventListener(
                        type,
                        (event) => {
                            event.preventDefault();
                            event.stopPropagation();
                        },
                        true,
                    );
                }
                viewer = await create(mount);
                if (token !== generation) return;
                await viewer.importSchema(schema);
                if (token !== generation) return;
                content.replaceChildren(mount);
                currentViewer = viewer;
                viewer = undefined;
                status.textContent = "Saved form loaded.";
            } catch (error) {
                if (token === generation) {
                    status.textContent =
                        error instanceof Error ? error.message : "The form could not be previewed.";
                }
            } finally {
                viewer?.destroy();
                if (token === generation) content.setAttribute("aria-busy", "false");
            }
        }

        refresh.addEventListener("click", () => void load());
        panel.querySelector("[data-close]")!.addEventListener("click", close);
        panel.addEventListener("cancel", (event) => {
            event.preventDefault();
            close();
        });
        panel.addEventListener("keydown", (event) => event.stopPropagation());
        document.body.append(panel);
        panel.showModal();
        void load();
    }

    return { open, dispose: close };
}
