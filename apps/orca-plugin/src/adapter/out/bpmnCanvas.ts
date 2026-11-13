import type { ClipboardOptions } from "@miragon/bpmn-modeler";
import {
    createModeSession,
    isEditableSurface,
    mountModeStrip,
    SURFACE_MODES,
    type DetectedEngine,
    type ModeSession,
    type ModeStrip,
    type SurfaceFactories,
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
    focusCanvas(): void;
    isCanvasFocused(): boolean;
}

interface CanvasFocus {
    focus(): void;
    isFocused(): boolean;
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

    const canvasFocus = (): CanvasFocus | undefined =>
        session?.getHandle().getService<CanvasFocus>("canvas");
    const renderStrip = (busy: boolean): void => {
        if (session) strip?.render({ mode: session.getMode(), engine, busy });
    };

    async function startSession(nextEngine: DetectedEngine): Promise<ModeSession> {
        await session?.destroy();
        engine = nextEngine;
        session = await createModeSession({
            container: options.container,
            engine,
            surfaces,
            theme,
            onModeChanged: () => renderStrip(false),
            onSwitchStateChanged: renderStrip,
            onError: (error) => console.warn("Unable to switch the BPMN mode", error),
        });
        const liveSession = session;
        liveSession.onContentChanged(() => editListeners.forEach((listener) => listener()));
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
        if (isBlankDocument(text) && isEditableSurface(surface)) {
            await surface.newDiagram();
            return;
        }
        await surface.reloadDiagram(text);
    }

    return {
        async importText(text) {
            try {
                await show(text);
                return true;
            } catch (error) {
                console.warn("Unable to open the BPMN diagram", error);
                return false;
            }
        },
        exportText: () => session!.getHandle().exportDiagram(),
        applyPendingInput: () => session?.flushPendingInput(),
        onEdit: (listener) => {
            editListeners.add(listener);
            return () => editListeners.delete(listener);
        },
        setTheme: (next) => {
            theme = next;
            session?.setTheme(next);
        },
        focusCanvas: () => canvasFocus()?.focus(),
        isCanvasFocused: () => canvasFocus()?.isFocused() ?? false,
    };
}
