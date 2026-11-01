import type BaseViewer from "bpmn-js/lib/BaseViewer";
import {
    type DisposableStore,
    type FlushableDebounceInput,
    NoModelerError,
    ThemeController,
} from "@miragon/bpmn-modeler-types";

import { installSurfaceFocusFeatures, type SurfaceFocusOptions } from "./focusFeatures";
import type { ThemeMode } from "./publicApi";
import type { RootElementManager } from "./rootElement";
import type { SelectionManager } from "./selection";
import { SurfaceView, type ViewState } from "./viewState";
import type { ViewportManager } from "./viewport";

type SurfaceInstance = Pick<BaseViewer, "get" | "destroy">;

const THEME_ATTRIBUTE = "data-bpmn-theme";

export interface SurfaceServices {
    /** @throws {NoModelerError} If no bpmn-js instance is live. */
    service<S>(name: string): S;
    /** `undefined` when the instance was built without the service. */
    optionalService<S>(name: string): S | undefined;
}

/**
 * The facade owns the {@link DisposableStore} and hands it in, so registration
 * order, and with it LIFO teardown, stays the facade's.
 */
export class SurfaceCore<T extends SurfaceInstance> implements SurfaceServices {
    private liveInstance: T | undefined;

    private view: SurfaceView | undefined;

    private themeController: ThemeController | undefined;

    /**
     * @param container The canvas host the bpmn-js instance attaches to.
     * @param themeRoots The roots that carry this instance's `data-bpmn-theme`.
     */
    constructor(
        private readonly container: HTMLElement,
        private readonly themeRoots: readonly HTMLElement[],
    ) {}

    /** @throws {NoModelerError} If no bpmn-js instance is live. */
    get instance(): T {
        if (!this.liveInstance) {
            throw new NoModelerError();
        }
        return this.liveInstance;
    }

    get viewport(): ViewportManager {
        return this.liveView().viewport;
    }

    get selection(): SelectionManager {
        return this.liveView().selection;
    }

    get rootElement(): RootElementManager {
        return this.liveView().rootElement;
    }

    /**
     * Constructs the bpmn-js instance and registers, in this order, its
     * destruction, its view and the focus features on `store`.
     */
    allocate(store: DisposableStore, construct: () => T, focus: SurfaceFocusOptions): void {
        try {
            this.liveInstance = construct();
        } catch (error) {
            // A partially-constructed bpmn-js attaches `.bjs-container` with no
            // handle to destroy; clear the dedicated container before rethrowing.
            this.container.replaceChildren();
            throw error;
        }
        store.add(() => {
            this.liveInstance?.destroy();
            this.liveInstance = undefined;
        });
        const accessor = <S>(name: string): S => this.service<S>(name);
        const view = new SurfaceView(accessor);
        this.view = view;
        store.add(() => view.dispose());

        store.add(installSurfaceFocusFeatures(accessor, focus));
    }

    /** Drops the managers once the facade's store has torn the instance down. */
    releaseManagers(): void {
        this.view = undefined;
    }

    service<S>(name: string): S {
        return this.instance.get<S>(name);
    }

    optionalService<S>(name: string): S | undefined {
        return this.instance.get<S>(name, false) ?? undefined;
    }

    captureViewState(): ViewState {
        return this.liveView().capture();
    }

    applyViewState(state: ViewState): void {
        this.liveView().apply(state);
    }

    /** `false` once destroyed: a torn-down panel holds no input. */
    hasPendingInput(): boolean {
        return this.panelInput()?.hasPending() ?? false;
    }

    /** A no-op once destroyed. */
    flushPendingInput(): void {
        this.panelInput()?.flush();
    }

    /** Arms the one-time initial fit for the diagram that was just imported. */
    armInitialViewport(): void {
        this.liveView().diagramLoaded();
    }

    /** A no-op once `store` is disposed, so a destroyed surface keeps no theme residue. */
    setTheme(store: DisposableStore, theme: ThemeMode): void {
        if (store.isDisposed) {
            return;
        }
        if (!this.themeController) {
            this.themeController = new ThemeController(this.themeRoots, THEME_ATTRIBUTE);
            store.add(() => {
                this.themeController?.dispose();
                // A replacement store on the same surface must be able to rebuild it.
                this.themeController = undefined;
            });
        }
        this.themeController.setMode(theme);
    }

    private panelInput(): FlushableDebounceInput | undefined {
        return this.liveInstance?.get<FlushableDebounceInput>("debounceInput", false) ?? undefined;
    }

    private liveView(): SurfaceView {
        if (!this.view) {
            throw new NoModelerError();
        }
        return this.view;
    }
}
