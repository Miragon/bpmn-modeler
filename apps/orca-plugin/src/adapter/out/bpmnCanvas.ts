import type { ClipboardOptions } from "@miragon/bpmn-modeler";
import {
    createModeSession,
    mountModeStrip,
    SURFACE_MODES,
    type DetectedEngine,
    type ModeSession,
    type ModeStrip,
    type SurfaceFactories,
    type SurfaceHandle,
} from "@miragon/bpmn-modeler/mode";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import type { HostThemeKind } from "@miragon/bpmn-modeler-shared";
import { detectEngine, isBlankDocument } from "@miragon/bpmn-modeler-types";

import type { ModelCanvas } from "../../port/modelCanvas";
import { memoryClipboard } from "./memoryClipboard";

export interface BpmnCanvasOptions {
    container: HTMLElement;
    panelParent: HTMLElement;
    /** The mode strip's element and the panel host that carries its state. */
    strip: { el: HTMLElement; host: HTMLElement };
    readOnly: boolean;
    theme: HostThemeKind;
}

export interface BpmnCanvas extends ModelCanvas {
    setTheme(theme: HostThemeKind): void;
}

function surfaceFactories(panelParent: HTMLElement, clipboard: ClipboardOptions): SurfaceFactories {
    const linting = async () => ({ linting: { module: await import("@miragon/bpmn-modeler/lint") } });
    return {
        view: async ({ container, theme }) => {
            const { createViewer } = await import("@miragon/bpmn-modeler/viewer");
            return createViewer(container, { theme, propertiesPanel: { parent: panelParent } });
        },
        design: async ({ container, theme }) => {
            const { createDesigner } = await import("@miragon/bpmn-modeler/design");
            return createDesigner(container, {
                theme,
                clipboard,
                propertiesPanel: { parent: panelParent },
                ...(await linting()),
            });
        },
        implement: async ({ container, theme, mode, engine }) => {
            const { createModeler } = await import("@miragon/bpmn-modeler");
            return createModeler(container, {
                engine,
                mode,
                theme,
                clipboard,
                propertiesPanel: { parent: panelParent },
                ...(await linting()),
            });
        },
    };
}

function hasCommandStack(
    handle: SurfaceHandle,
): handle is SurfaceHandle & { onCommandStackChanged(listener: () => void): () => void } {
    return "onCommandStackChanged" in handle;
}

function holdsPendingInput(
    handle: SurfaceHandle,
): handle is SurfaceHandle & { flushPendingInput(): void } {
    return "flushPendingInput" in handle;
}

/**
 * The BPMN mode session (View, Design, Implement) as a canvas. The engine is
 * read from each text Orca hands over; a text for another engine rebuilds the
 * session, since a surface's engine is fixed when it is created.
 */
export function createBpmnCanvas(options: BpmnCanvasOptions): BpmnCanvas {
    const factories = surfaceFactories(options.panelParent, { bridge: memoryClipboard() });
    const surfaces = options.readOnly ? { view: factories.view } : factories;
    const editListeners = new Set<() => void>();
    let theme = options.theme;
    let engine: DetectedEngine;
    let session: ModeSession | undefined;
    let strip: ModeStrip | undefined;
    let stopListening = (): void => undefined;
    let shownOnce = false;

    const renderStrip = (busy: boolean): void => {
        if (session) strip?.render({ mode: session.getMode(), engine, busy });
    };

    function listenTo(handle: SurfaceHandle): void {
        stopListening();
        stopListening = hasCommandStack(handle)
            ? handle.onCommandStackChanged(() => editListeners.forEach((listener) => listener()))
            : () => undefined;
    }

    async function startSession(nextEngine: DetectedEngine): Promise<ModeSession> {
        await session?.destroy();
        engine = nextEngine;
        session = await createModeSession({
            container: options.container,
            engine,
            surfaces,
            theme,
            onSurfaceCreated: listenTo,
            onModeChanged: () => renderStrip(false),
            onSwitchStateChanged: renderStrip,
            onError: (error) => console.warn("Unable to switch the BPMN mode", error),
        });
        const liveSession = session;
        strip ??= mountModeStrip({
            host: options.strip.host,
            stripEl: options.strip.el,
            modes: SURFACE_MODES,
            translate: (template, replacements) => i18n.translate(template, replacements),
            onLabelChange: (apply) => i18n.onChange(apply),
            onSelect: (mode) => void session?.requestMode(mode),
        });
        renderStrip(false);
        return liveSession;
    }

    async function show(text: string): Promise<void> {
        const nextEngine = detectEngine(text);
        const kept = session !== undefined && nextEngine === engine;
        const live = kept ? session! : await startSession(nextEngine);
        const surface = live.getHandle();
        if (isBlankDocument(text) && "newDiagram" in surface) {
            await surface.newDiagram();
            return;
        }
        const view = shownOnce && kept ? surface.captureViewState() : undefined;
        await surface.loadDiagram(text);
        if (view) surface.applyViewState(view);
    }

    return {
        async importText(text) {
            try {
                await show(text);
                shownOnce = true;
                return true;
            } catch (error) {
                console.warn("Unable to open the BPMN diagram", error);
                return false;
            }
        },
        exportText: () => session!.getHandle().exportDiagram(),
        applyPendingInput: () => {
            const surface = session?.getHandle();
            if (surface && holdsPendingInput(surface)) surface.flushPendingInput();
        },
        onEdit: (listener) => {
            editListeners.add(listener);
            return () => editListeners.delete(listener);
        },
        setTheme: (next) => {
            theme = next;
            session?.setTheme(next);
        },
    };
}
