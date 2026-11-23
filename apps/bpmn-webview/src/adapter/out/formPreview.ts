import type { FormPreviewHandle, FormPreviewRequest } from "@miragon/bpmn-modeler";
import type { FormPreviewResult } from "@miragon/bpmn-modeler-types";
import { ensureArrayToSorted, ensureUrlCanParse } from "@miragon/bpmn-modeler-browser";
import { i18n } from "@miragon/bpmn-modeler-i18n";

import { parsePreviewSchema } from "../../domain/formPreviewSchema";
import { positionFormPreview } from "../../domain/formPreviewPosition";
import { FORM_PREVIEW_TEXTS, FORM_PREVIEW_UNAVAILABLE_TEXTS } from "../../domain/formPreviewTexts";
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
        let frame: number | undefined;
        const panel = document.createElement("div");
        panel.className = "linked-form-preview";
        panel.style.width = "340px";
        panel.setAttribute("role", "region");
        panel.innerHTML =
            '<header><h2></h2><button type="button" data-refresh></button><button type="button" data-close>×</button></header><p data-description></p><p role="status" aria-live="polite"></p><div class="linked-form-preview-content"></div>';
        const content = panel.querySelector<HTMLElement>(".linked-form-preview-content")!;
        const closeButton = panel.querySelector<HTMLButtonElement>("[data-close]")!;
        const status = panel.querySelector<HTMLElement>('[role="status"]')!;
        let statusKey = "";
        function translate(): void {
            if (indicator) panel.removeAttribute("aria-label");
            else panel.setAttribute("aria-label", i18n.translate(FORM_PREVIEW_TEXTS.title));
            panel.querySelector("h2")!.textContent = i18n.translate(FORM_PREVIEW_TEXTS.title);
            panel.querySelector("[data-refresh]")!.textContent = i18n.translate(FORM_PREVIEW_TEXTS.refresh);
            closeButton.setAttribute("aria-label", i18n.translate(FORM_PREVIEW_TEXTS.close));
            closeButton.title = i18n.translate(FORM_PREVIEW_TEXTS.close);
            panel.querySelector("[data-description]")!.textContent = i18n.translate(
                FORM_PREVIEW_TEXTS.description,
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
            const style = getComputedStyle(panel);
            const number = (value: string) => parseFloat(value) || 0;
            const chrome = ["header", "[data-description]", '[role="status"]'].map((selector) => {
                const node = panel.querySelector<HTMLElement>(selector)!;
                const css = getComputedStyle(node);
                return node.hidden
                    ? 0
                    : Math.max(node.offsetHeight, node.scrollHeight) +
                          number(css.marginTop) +
                          number(css.marginBottom);
            });
            const chromeHeight =
                (indicator ? Math.max(...chrome) : chrome.reduce((a, b) => a + b, 0)) +
                number(style.paddingTop) +
                number(style.paddingBottom) +
                number(style.borderTopWidth) +
                number(style.borderBottomWidth);
            const measuredHeight = chromeHeight + (indicator ? 0 : content.scrollHeight);
            const minimumHeight = chromeHeight + (viewer ? 64 : 0);
            const anchor = request.anchor();
            // Keep controls reachable even when the canvas is collapsed.
            if (anchor.canvas.width < 160 || anchor.canvas.height < 80)
                anchor.canvas = {
                    x: 0,
                    y: 0,
                    width: window.innerWidth,
                    height: window.innerHeight,
                };
            const position = positionFormPreview(
                anchor,
                340,
                Math.max(indicator ? 48 : 120, measuredHeight, minimumHeight),
            );
            for (const [key, value] of Object.entries({
                left: position.left,
                top: position.top,
                width: position.width,
                maxHeight: position.maxHeight,
            })) {
                const property = key as "left" | "top" | "width" | "maxHeight";
                if (panel.style[property] !== `${value}px`) panel.style[property] = `${value}px`;
            }
            setVisible(true);
        }
        function scheduleReposition(): void {
            if (closed || frame !== undefined) return;
            frame = requestAnimationFrame(() => {
                frame = undefined;
                reposition();
            });
        }
        const observer =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(scheduleReposition)
                : undefined;
        function close(): void {
            closed = true;
            generation++;
            observer?.disconnect();
            if (frame !== undefined) cancelAnimationFrame(frame);
            unsubscribe();
            window.removeEventListener("resize", scheduleReposition);
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
            let failureKey: string = FORM_PREVIEW_UNAVAILABLE_TEXTS.unreadable;
            let importing: PreviewViewer | undefined;
            try {
                const result = await read(request.id, automatic);
                if (closed || token !== generation) return;
                if (result.kind === "cancelled") {
                    if (wasVisible) show("");
                    return;
                }
                if (result.kind === "unavailable") {
                    failureKey = FORM_PREVIEW_UNAVAILABLE_TEXTS[result.reason];
                    throw new Error(failureKey);
                }
                failureKey = FORM_PREVIEW_TEXTS.invalidForm;
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
                failureKey = FORM_PREVIEW_TEXTS.viewerFailed;
                importing = await create(mount);
                if (closed || token !== generation) return;
                await importing.importSchema(schema);
                if (closed || token !== generation) return;
                viewer = importing;
                importing = undefined;
                content.replaceChildren(mount);
                show(FORM_PREVIEW_TEXTS.loaded);
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
        window.addEventListener("resize", scheduleReposition);
        active = { close, reposition: scheduleReposition };
        if (request.unavailable)
            indicate(FORM_PREVIEW_TEXTS.referenceBroken);
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
