import type { FormPreviewHandle, FormPreviewRequest } from "@miragon/bpmn-modeler";
import type { FormPreviewReply } from "@miragon/bpmn-modeler-shared";
import { ensureArrayToSorted, ensureUrlCanParse } from "@miragon/bpmn-modeler-shared";

import { parsePreviewSchema } from "./formPreviewSchema";
import { positionFormPreview } from "./formPreviewPosition";
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
    read: (id: string, automatic: boolean) => Promise<FormPreviewReply>,
    create: PreviewViewerFactory = createViewer,
) {
    let active: FormPreviewHandle | undefined;

    function open(request: FormPreviewRequest): FormPreviewHandle {
        active?.close();
        let generation = 0;
        let closed = false;
        let visible = false;
        let viewer: PreviewViewer | undefined;
        const panel = document.createElement("section");
        panel.className = "linked-form-preview";
        panel.setAttribute("role", "region");
        panel.setAttribute("aria-label", "Linked form preview");
        panel.innerHTML =
            '<header><h2>Linked form preview</h2><button type="button" data-refresh>Refresh</button><button type="button" data-close aria-label="Close form preview" title="Close form preview">×</button></header><p>Read-only preview of the saved local form.</p><p role="status" aria-live="polite"></p><div class="linked-form-preview-content"></div>';
        const content = panel.querySelector<HTMLElement>(".linked-form-preview-content")!;
        const closeButton = panel.querySelector<HTMLButtonElement>("[data-close]")!;
        const status = panel.querySelector<HTMLElement>('[role="status"]')!;

        function setVisible(value: boolean): void {
            if (visible !== value) {
                visible = value;
                request.onVisibilityChanged(value);
            }
        }
        function reposition(): void {
            if (closed || !panel.isConnected) return;
            const position = positionFormPreview(
                request.anchor(),
                340,
                Math.max(120, panel.scrollHeight - content.clientHeight + content.scrollHeight),
            );
            panel.hidden = !position;
            if (position) {
                panel.style.left = `${position.left}px`;
                panel.style.top = `${position.top}px`;
                panel.style.width = `${position.width}px`;
                panel.style.maxHeight = `${position.maxHeight}px`;
            }
            setVisible(Boolean(position));
        }
        const observer =
            typeof ResizeObserver !== "undefined" ? new ResizeObserver(reposition) : undefined;
        function close(): void {
            closed = true;
            generation++;
            observer?.disconnect();
            window.removeEventListener("resize", reposition);
            panel.remove();
            viewer?.destroy();
            viewer = undefined;
            setVisible(false);
        }
        function dismiss(): void {
            const restoreFocus = panel.contains(document.activeElement);
            close();
            request.onClose();
            if (restoreFocus) request.focusCanvas();
        }
        async function load(): Promise<void> {
            const token = ++generation;
            viewer?.destroy();
            viewer = undefined;
            panel.remove();
            setVisible(false);
            content.replaceChildren();
            let importing: PreviewViewer | undefined;
            try {
                const result = await read(request.id, request.automatic);
                if (closed || token !== generation) return;
                if (result.kind === "unavailable") return;
                const schema = parsePreviewSchema(result.content);
                const mount = document.createElement("div");
                // Keep content readable to assistive technology without enabling form actions.
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
                importing = await create(mount);
                if (closed || token !== generation) return;
                await importing.importSchema(schema);
                if (closed || token !== generation) return;
                viewer = importing;
                importing = undefined;
                content.replaceChildren(mount);
                status.textContent = "Saved form loaded.";
                panel.style.width = "340px";
                document.body.append(panel);
                reposition();
                observer?.observe(panel);
                if (!request.automatic && !panel.hidden) closeButton.focus();
            } catch {
                // Failed or unsupported forms have no preview surface.
                if (!closed && token === generation) {
                    panel.remove();
                    setVisible(false);
                }
            } finally {
                importing?.destroy();
            }
        }
        panel.querySelector("[data-refresh]")!.addEventListener("click", () => void load());
        closeButton.addEventListener("click", dismiss);
        panel.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
                event.preventDefault();
                dismiss();
            }
        });
        window.addEventListener("resize", reposition);
        active = { close, reposition };
        void load();
        return active;
    }
    return {
        open,
        dispose: () => {
            active?.close();
            active = undefined;
        },
    };
}
