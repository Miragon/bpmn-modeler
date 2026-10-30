import type { FormPreviewHandle, FormPreviewRequest } from "@miragon/bpmn-modeler";
import type { FormPreviewResult } from "@miragon/bpmn-modeler-types";
import { ensureArrayToSorted, ensureUrlCanParse } from "@miragon/bpmn-modeler-types";
import { i18n } from "@miragon/bpmn-modeler-i18n";

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
    read: (id: string, automatic: boolean) => Promise<FormPreviewResult>,
    create: PreviewViewerFactory = createViewer,
    log: (message: string) => void = (message) => console.warn(message),
) {
    let active: FormPreviewHandle | undefined;

    function open(request: FormPreviewRequest): FormPreviewHandle {
        active?.close();
        let generation = 0;
        let closed = false;
        let visible = false;
        let viewer: PreviewViewer | undefined;
        let indicator = false;
        const panel = document.createElement("div");
        panel.className = "linked-form-preview";
        panel.setAttribute("role", "region");
        panel.innerHTML =
            '<header><h2></h2><button type="button" data-refresh></button><button type="button" data-close>×</button></header><p data-description></p><p role="status" aria-live="polite"></p><div class="linked-form-preview-content"></div>';
        const content = panel.querySelector<HTMLElement>(".linked-form-preview-content")!;
        const closeButton = panel.querySelector<HTMLButtonElement>("[data-close]")!;
        const status = panel.querySelector<HTMLElement>('[role="status"]')!;
        let statusKey = "";
        function translate(): void {
            if (indicator) panel.removeAttribute("aria-label");
            else panel.setAttribute("aria-label", i18n.translate("Linked form preview"));
            panel.querySelector("h2")!.textContent = i18n.translate("Linked form preview");
            panel.querySelector("[data-refresh]")!.textContent = i18n.translate("Refresh");
            closeButton.setAttribute("aria-label", i18n.translate("Close form preview"));
            closeButton.title = i18n.translate("Close form preview");
            panel.querySelector("[data-description]")!.textContent = i18n.translate(
                "Read-only preview of the saved local form.",
            );
            status.textContent = statusKey ? i18n.translate(statusKey) : "";
            reposition();
        }
        translate();
        const unsubscribe = i18n.onChange(translate);
        function show(message: string): void {
            statusKey = message;
            translate();
            if (!panel.isConnected) document.body.append(panel);
            reposition();
            observer?.observe(panel);
        }

        function indicate(message: string): void {
            indicator = true;
            panel.classList.add("linked-form-preview-indicator");
            panel.removeAttribute("role");
            panel.querySelector("h2")!.hidden = true;
            panel.querySelector<HTMLElement>("[data-refresh]")!.hidden = true;
            panel.querySelector<HTMLElement>("[data-description]")!.hidden = true;
            show(message);
        }

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
                Math.max(
                    indicator ? 48 : 120,
                    panel.scrollHeight -
                        content.clientHeight +
                        content.scrollHeight +
                        (indicator ? panel.offsetHeight - panel.clientHeight : 0),
                ),
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
            unsubscribe();
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
        async function load(automatic: boolean): Promise<void> {
            if (!automatic) request.onExplicitRequest?.();
            const token = ++generation;
            const wasVisible = visible;
            viewer?.destroy();
            viewer = undefined;
            content.replaceChildren();
            statusKey = "";
            translate();
            panel.setAttribute("aria-busy", "true");
            let failureKey = "The saved form could not be read. Refresh to try again.";
            let importing: PreviewViewer | undefined;
            try {
                const result = await read(request.id, automatic);
                if (closed || token !== generation) return;
                if (result.kind === "cancelled") {
                    if (wasVisible) show("");
                    return;
                }
                if (result.kind === "unavailable") {
                    const messages = {
                        noScope: "Open a workspace folder to preview linked forms.",
                        notFound:
                            "No saved local form matches this reference. Refresh to try again.",
                        ambiguous:
                            "Multiple saved forms match this reference. Choose a form to preview.",
                        unreadable: "The saved form could not be read. Refresh to try again.",
                        timeout: "The host did not answer. Refresh to try again.",
                    };
                    failureKey = messages[result.reason];
                    throw new Error(failureKey);
                }
                failureKey =
                    "The saved form is invalid or unsupported. Open it in the form editor.";
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
                failureKey = "The form preview could not be loaded. Refresh to try again.";
                importing = await create(mount);
                if (closed || token !== generation) return;
                await importing.importSchema(schema);
                if (closed || token !== generation) return;
                viewer = importing;
                importing = undefined;
                content.replaceChildren(mount);
                panel.style.width = "340px";
                show("Saved form loaded.");
                if (!automatic && !panel.hidden) closeButton.focus();
            } catch (error) {
                if (!closed && token === generation) {
                    log(`Form preview: ${String(error)}`);
                    if (automatic) indicate(failureKey);
                    else {
                        show(failureKey);
                        if (!wasVisible && !panel.hidden) closeButton.focus();
                    }
                }
            } finally {
                importing?.destroy();
                if (!closed && token === generation) panel.setAttribute("aria-busy", "false");
            }
        }
        panel.querySelector("[data-refresh]")!.addEventListener("click", () => void load(false));
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
        if (request.unavailable)
            indicate("The linked form is missing or invalid. Check the form reference.");
        else void load(request.automatic);
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
