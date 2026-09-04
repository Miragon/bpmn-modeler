import type { DetectedEngine, ModelerMode, ThemeMode } from "@miragon/bpmn-modeler";
import {
    createSurface,
    isModelerHandle,
    type DemoSurfaceHandle,
    type SurfaceContext,
} from "./surfaces";
import { defaultMode, isModeAvailable, planTransition, type DemoMode } from "./modeModel";

export interface ModeSessionDeps {
    canvas: HTMLElement;
    panelMount: HTMLElement;
    engine: DetectedEngine;
    initialTheme: ThemeMode;
    /** Called after a mode is actually applied (fresh surface, toggle, or recreate). */
    onModeApplied: (mode: DemoMode) => void;
    /** Called when a recreate switch enters/leaves its handle-less window. */
    onSwitchStateChanged: (busy: boolean) => void;
    /** Called when a switch fails; the session then falls back to the default mode. */
    onError: (error: unknown) => void;
}

/**
 * Owns the single live surface for the BPMN modeler page and switches it between
 * modes. Switching is serialised: a request that arrives while a recreate is in
 * flight is remembered and replayed once the current one lands, so two instances
 * never coexist and the last click wins. Design↔Implement on a tagged model is a
 * live `setMode` toggle (undo/selection/plane survive); anything else destroys
 * the instance and stands up the target factory, handing the view state over.
 */
export class ModeSession {
    private handle: DemoSurfaceHandle;
    private currentMode: DemoMode;
    private theme: ThemeMode;
    private busy = false;
    private pendingRequest: DemoMode | null = null;

    private constructor(
        handle: DemoSurfaceHandle,
        mode: DemoMode,
        private readonly deps: ModeSessionDeps,
    ) {
        this.handle = handle;
        this.currentMode = mode;
        this.theme = deps.initialTheme;
    }

    /** Stands up the initial surface, loads the diagram, and returns the session. */
    static async start(mode: DemoMode, xml: string, deps: ModeSessionDeps): Promise<ModeSession> {
        // The surface's mode-change callback is created before the session exists,
        // so it reads through a holder assigned once the instance is built.
        const holder: { session?: ModeSession } = {};
        const ctx = ModeSession.buildContext(deps, deps.initialTheme, (m) =>
            holder.session?.onModelerModeChanged(m),
        );
        const handle = await createSurface(mode, ctx);
        const session = new ModeSession(handle, mode, deps);
        holder.session = session;
        await handle.loadDiagram(xml);
        // bpmn-js does not auto-fit on import, and there is no saved view state
        // on the first open, so a diagram authored off-origin would render
        // off-screen. Recreate switches restore a captured viewbox instead.
        handle.viewport.fitViewport();
        deps.onModeApplied(mode);
        return session;
    }

    getMode(): DemoMode {
        return this.currentMode;
    }

    getHandle(): DemoSurfaceHandle {
        return this.handle;
    }

    setTheme(theme: ThemeMode): void {
        this.theme = theme;
        this.handle.setTheme(theme);
    }

    /**
     * Requests a switch to `target`. Unavailable targets are ignored. While a
     * recreate is in flight only the latest request is kept and replayed on
     * completion; a live toggle runs immediately.
     */
    requestMode(target: DemoMode): void {
        if (!isModeAvailable(target, this.deps.engine)) {
            return;
        }
        if (this.busy) {
            this.pendingRequest = target;
            return;
        }

        const kind = planTransition(this.currentMode, target, this.deps.engine);
        if (kind === "none") {
            return;
        }
        if (kind === "toggle") {
            // The mode update + onModeApplied happen in onModelerModeChanged, the
            // single writer, so the strip and the instance cannot drift.
            if (isModelerHandle(this.handle)) {
                this.handle.setMode(target as ModelerMode);
            }
            return;
        }
        void this.recreate(target);
    }

    /** The modeler's `onModeChanged` — the only writer of `currentMode` on a toggle. */
    private onModelerModeChanged(mode: ModelerMode): void {
        this.currentMode = mode;
        this.deps.onModeApplied(mode);
    }

    private async recreate(target: DemoMode): Promise<void> {
        this.busy = true;
        this.deps.onSwitchStateChanged(true);

        // Captured before the destroy so the view state survives the swap; kept
        // in scope so the failure path can re-import the same diagram.
        const state = this.handle.captureViewState();
        let xml: string;
        try {
            xml = await this.handle.exportDiagram();
        } catch (error) {
            // Nothing was destroyed yet — surface the error and keep the instance.
            this.busy = false;
            this.deps.onSwitchStateChanged(false);
            this.deps.onError(error);
            return;
        }

        try {
            this.handle.destroy();
            this.handle = await this.buildSurface(target);
            this.currentMode = target;
            await this.handle.loadDiagram(xml);
            this.handle.applyViewState(state);
            this.deps.onModeApplied(target);
        } catch (error) {
            this.deps.onError(error);
            await this.fallbackToDefault(xml);
        } finally {
            this.busy = false;
            this.deps.onSwitchStateChanged(false);
        }

        this.drainPendingRequest();
    }

    /** After a failed switch (past destroy) the page must never be handle-less. */
    private async fallbackToDefault(xml: string): Promise<void> {
        const fallback = defaultMode(this.deps.engine);
        this.handle = await this.buildSurface(fallback);
        this.currentMode = fallback;
        await this.handle.loadDiagram(xml);
        this.deps.onModeApplied(fallback);
    }

    private drainPendingRequest(): void {
        const pending = this.pendingRequest;
        this.pendingRequest = null;
        if (pending !== null && pending !== this.currentMode) {
            this.requestMode(pending);
        }
    }

    private buildSurface(mode: DemoMode): Promise<DemoSurfaceHandle> {
        const ctx = ModeSession.buildContext(this.deps, this.theme, (m) =>
            this.onModelerModeChanged(m),
        );
        return createSurface(mode, ctx);
    }

    private static buildContext(
        deps: ModeSessionDeps,
        theme: ThemeMode,
        onModelerModeChanged: (mode: ModelerMode) => void,
    ): SurfaceContext {
        return {
            canvas: deps.canvas,
            panelMount: deps.panelMount,
            engine: deps.engine,
            theme,
            onModelerModeChanged,
        };
    }
}
