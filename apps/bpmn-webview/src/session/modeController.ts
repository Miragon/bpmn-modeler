import type { ModelerMode } from "@miragon/bpmn-modeler";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    SURFACE_MODES,
    createModeSession,
    mountModeStrip,
    type ModeSession,
    type ModeStrip,
    type ModeTransition,
    type SurfaceFactories,
} from "@miragon/bpmn-modeler/mode";
import {
    type HostThemeKind,
    type InertLockGroup,
    LogErrorCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    type DetectedEngine,
    NoModelerError,
    type SurfaceMode,
    UnsupportedEngineError,
} from "@miragon/bpmn-modeler-types";

import type { HostModelerState } from "../hostModelerState";
import type { WebviewStateManager } from "../state";
import { isModelerHandle, type SurfaceHandle } from "../surface";
import type { BpmnDocumentSession } from "./documentSession";
import type { HostChannel } from "./hostChannel";
import type { SurfaceBinder, SurfaceBinding } from "./surfaceBinding";

interface ModeControllerPorts {
    hostModelerState: Pick<HostModelerState, "restoreOpenScripts">;
    pageInertLocks: InertLockGroup;
}

interface ModeStripMount {
    /** Carries the strip's `data-surface-mode` / `aria-busy`. */
    host: HTMLElement;
    stripEl: HTMLElement;
}

interface ModeControllerStart {
    // Handed over here, not at creation, so the session can be built over this controller's surface.
    session: Pick<
        BpmnDocumentSession,
        "isReady" | "isReloadingForEngine" | "runExclusive" | "flushBeforeSurfaceDestroy"
    >;
    binder: SurfaceBinder;
    container: HTMLElement;
    engine: DetectedEngine;
    surfaces: SurfaceFactories;
    initialMode: string | null;
    theme: HostThemeKind;
    strip: ModeStripMount;
}

export interface ModeController {
    /** Resolves `false` when no surface could be built; the failure is already reported. */
    start(options: ModeControllerStart): Promise<boolean>;
    getSurface(): SurfaceHandle;
    /** `undefined` until the initial surface is bound after its import. */
    getViewState(): WebviewStateManager | undefined;
    /** Stays the live state manager until {@link markInitialSurfaceReady} opens mode switches. */
    bindInitialSurface(): WebviewStateManager;
    /** Drops the strip's busy state and opens it for mode switches. */
    markInitialSurfaceReady(): void;
    followModelerToggle(mode: ModelerMode): void;
    setTheme(kind: HostThemeKind): void;
    focusCanvas(): void;
    disposeSurfaceBinding(): void;
}

/**
 * Owns the single live surface and switches it between the available modes: a
 * Design↔Implement change on a tagged model is a live `setMode` toggle
 * (undo/selection/plane survive), anything else exports → destroys → recreates
 * → restores. It builds the initial surface but does not load a diagram — the
 * document session's initial import does that.
 */
export function createModeController(
    host: HostChannel,
    { hostModelerState, pageInertLocks }: ModeControllerPorts,
): ModeController {
    const switchLock = pageInertLocks.createLock();
    // start() assigns these; setTheme alone guards against an earlier call.
    let surface!: SurfaceHandle;
    let session!: ModeControllerStart["session"];
    let binder!: SurfaceBinder;
    let engine: DetectedEngine;
    let surfaceMode!: SurfaceMode;
    let binding: SurfaceBinding | undefined;
    let modeSession: ModeSession | undefined;
    let strip: ModeStrip | undefined;
    // `switchPending` blocks re-entrant switches while a recreate is in flight;
    // `initialSurfaceReady` blocks switches until the boot restore, which drives
    // the live surface's state manager, has finished.
    let switchPending = false;
    let initialSurfaceReady = false;

    const focusCanvas = (): void => surface.getService<{ focus(): void }>("canvas").focus();
    const renderStrip = (busy: boolean): void => strip?.render({ mode: surfaceMode, engine, busy });
    // Switches open only once the initial surface is bound, so a switch always finds a binding.
    const boundViewState = (): WebviewStateManager => binding!.stateManager;

    function onModeChanged(mode: SurfaceMode, transition: ModeTransition): void {
        surfaceMode = mode;
        boundViewState().persistMode(mode);
        renderStrip(switchPending);
        // A toggle keeps the instance; a rebuilt one starts without locks, panel UI or persistence.
        if (transition === "toggle") return;
        const viewState = boundViewState();
        // A recreate already applied the carried snapshot; a fallback applied
        // none, so the persisted state restores.
        if (transition === "fallback") {
            viewState.restoreViewport();
        }
        // After the import: the script-source watcher baselines the locked
        // scripts from the loaded model.
        if (isModelerHandle(surface)) {
            hostModelerState.restoreOpenScripts(surface);
        }
        viewState.restorePanelUiState();
        viewState.startPersisting();
        binder.requestSurfaceResources(surface);
    }

    function createSession(options: ModeControllerStart): Promise<ModeSession> {
        return createModeSession({
            container: options.container,
            engine,
            surfaces: options.surfaces,
            initialMode: options.initialMode,
            theme: options.theme,
            onSurfaceCreated: (handle) => {
                surface = handle as SurfaceHandle;
                // The initial surface binds after its import; a recreate/fallback
                // binds here, before the mode session loads the carried XML.
                if (session.isReady()) {
                    binding = binder.bindSurface(surface);
                }
            },
            onSwitchStateChanged: (busy) => {
                switchPending = busy;
                if (busy) {
                    switchLock.acquire();
                } else {
                    switchLock.release();
                }
                renderStrip(busy);
            },
            onModeChanged,
            beforeDestroy: async () => {
                await session.flushBeforeSurfaceDestroy();
                binding?.dispose();
            },
            onError: (error) => {
                const cause = asError(error);
                host.postMessage(
                    new LogErrorCommand(`Unable to switch mode\n${cause.message}`, cause.stack),
                );
            },
        });
    }

    // Always offer all three modes, greying out the ones the current engine
    // can't reach (Implement on an untagged model) so the mode is discoverable —
    // the strip ignores clicks on an aria-disabled entry. A click is also dropped
    // until the initial surface is ready and while a switch or engine reload is
    // in flight, and otherwise queues behind the other modeler operations so it
    // never interleaves with an import.
    function mountStrip(mount: ModeStripMount, liveSession: ModeSession): ModeStrip {
        return mountModeStrip({
            host: mount.host,
            stripEl: mount.stripEl,
            modes: SURFACE_MODES,
            translate: (template, replacements) => i18n.translate(template, replacements),
            onLabelChange: (apply) => i18n.onChange(apply),
            onSelect: (mode) => {
                if (!initialSurfaceReady || switchPending || session.isReloadingForEngine) return;
                void session.runExclusive(() => liveSession.requestMode(mode));
            },
            onEscape: focusCanvas,
        });
    }

    return {
        async start(options) {
            session = options.session;
            binder = options.binder;
            engine = options.engine;
            let liveSession: ModeSession;
            try {
                liveSession = await createSession(options);
            } catch (error) {
                host.postMessage(surfaceCreationFailure(error));
                return false;
            }
            modeSession = liveSession;
            surfaceMode = liveSession.getMode();
            binder.requestSurfaceResources(surface);
            strip = mountStrip(options.strip, liveSession);
            renderStrip(true);
            return true;
        },
        getSurface: () => surface,
        getViewState: () => binding?.stateManager,
        bindInitialSurface: () => {
            binding = binder.bindSurface(surface);
            return binding.stateManager;
        },
        markInitialSurfaceReady: () => {
            initialSurfaceReady = true;
            renderStrip(false);
            // Persisted so a first-ever open remembers where it landed.
            boundViewState().persistMode(surfaceMode);
        },
        followModelerToggle: (mode) => {
            surfaceMode = mode;
            binding?.stateManager.persistMode(mode);
            renderStrip(switchPending);
        },
        setTheme: (kind) => {
            // Through the mode session so its stored theme stays current — a later
            // recreate then builds the next surface in the right theme.
            if (modeSession) {
                modeSession.setTheme(kind);
            } else {
                surface?.setTheme(kind);
            }
        },
        focusCanvas,
        disposeSurfaceBinding: () => binding?.dispose(),
    };
}

function asError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
}

function surfaceCreationFailure(error: unknown): LogErrorCommand {
    if (error instanceof NoModelerError || error instanceof UnsupportedEngineError) {
        return new LogErrorCommand(error.message);
    }
    const cause = asError(error);
    return new LogErrorCommand(`Unable to create modeler surface\n${cause.message}`, cause.stack);
}
