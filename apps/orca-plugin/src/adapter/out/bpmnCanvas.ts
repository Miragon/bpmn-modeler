import type { ClipboardOptions } from "@miragon/bpmn-modeler";
import {
    createModeSession,
    isEditableSurface,
    type DetectedEngine,
    type ModeSession,
    type SurfaceFactories,
} from "@miragon/bpmn-modeler/mode";
import type { HostThemeKind } from "@miragon/bpmn-modeler-shared";
import { detectEngine, isBlankDocument } from "@miragon/bpmn-modeler-types";

import type { ModelCanvas } from "../../port/modelCanvas";
import { memoryClipboard } from "./memoryClipboard";

export interface BpmnCanvasOptions {
    container: HTMLElement;
    panelParent: HTMLElement;
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
 * The BPMN mode session as a canvas, without a mode switch: a read-only tab is
 * viewed, an editable one lands in Implement when the model names an execution
 * platform and in Design when it does not. The engine is read from each text
 * Orca hands over; a text for another engine rebuilds the session, since a
 * surface's engine is fixed when it is created.
 */
export function createBpmnCanvas(options: BpmnCanvasOptions): BpmnCanvas {
    const { view, design, implement } = surfaceFactories(options.panelParent, {
        bridge: memoryClipboard(),
    });
    // An untagged model has no engine for the modeler, so Design serves it;
    // a tagged one gets both modes from the modeler.
    const surfaces: SurfaceFactories = options.readOnly ? { view } : { design, implement };
    const editListeners = new Set<() => void>();
    let theme = options.theme;
    let engine: DetectedEngine;
    let session: ModeSession | undefined;

    const canvasFocus = (): CanvasFocus | undefined =>
        session?.getHandle().getService<CanvasFocus>("canvas");

    async function startSession(nextEngine: DetectedEngine): Promise<ModeSession> {
        await session?.destroy();
        engine = nextEngine;
        session = await createModeSession({
            container: options.container,
            engine,
            surfaces,
            theme,
        });
        const liveSession = session;
        liveSession.onContentChanged(() => editListeners.forEach((listener) => listener()));
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
