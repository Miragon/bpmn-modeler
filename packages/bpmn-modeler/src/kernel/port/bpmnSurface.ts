import type { ImportXMLResult } from "bpmn-js/lib/BaseViewer";
import type Modeler from "bpmn-js/lib/Modeler";
import type NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import type { EditableSurfaceMode } from "@miragon/bpmn-modeler-types/domain";

import type { BpmnFeature } from "../domain/bpmnFeature";
import type { ThemeMode } from "../domain/themeMode";
import type { CoreModelerServices } from "./coreServices";
import type { BpmnSurfaceHandle, PendingInputHandle } from "./surfaceHandle";

type LazyBase<B> = () => Promise<B | { default: B }>;

/** The readonly subset of {@link CoreModelerServices}; the viewer port's `CoreViewerServices` equals it. */
export type ViewingSurfaceServices = Pick<
    CoreModelerServices,
    "canvas" | "elementRegistry" | "eventBus" | "overlays" | "selection"
>;

/** The editing base, as a value or a lazy import, so a viewer-only client bundles no `Modeler`. */
type ModelerBase = typeof Modeler | LazyBase<typeof Modeler>;

/** The viewing base, as a value or a lazy import. */
type ViewerBase = typeof NavigatedViewer | LazyBase<typeof NavigatedViewer>;

/** A feature, or a promise of one the kernel awaits before it constructs. */
export type FeatureEntry = BpmnFeature | Promise<BpmnFeature>;

interface SurfaceOptions {
    /** Built-in and caller features, merged in list order. A rejected one fails the surface. */
    readonly features: readonly FeatureEntry[];
    /**
     * Merged after every feature, so a plugin's provider wins and never the
     * reverse. One that rejects, misses a required name, provides a kernel name
     * or replaces a feature's moddle prefix is dropped and reported through
     * `onWarning`. A plugin module that throws while bpmn-js constructs still
     * fails the whole surface.
     */
    readonly plugins?: readonly FeatureEntry[];
    /** Roots beside the canvas container, such as the properties panel's parent. */
    readonly extraRoots?: readonly HTMLElement[];
    /** Defaults to `"automatic"`. */
    readonly theme?: ThemeMode;
    /** Opt in only for single-instance hosts; body events cannot identify a surface. */
    readonly handleGlobalEscape?: boolean;
    onWarning?(message: string): void;
    onError?(error: unknown): void;
}

/** @experimental */
export interface ViewerSurfaceOptions extends SurfaceOptions {
    readonly base: ViewerBase;
}

/** @experimental An editing surface without a Design/Implement mode. */
export interface EditingSurfaceOptions extends SurfaceOptions {
    readonly base: ModelerBase;
}

/** @experimental An editing surface that holds a Design/Implement mode. */
export interface ModalSurfaceOptions extends EditingSurfaceOptions {
    readonly mode: EditableSurfaceMode;
    /** Runs after the panel, the mode attribute and lint have followed a change. */
    onModeChanged?(mode: EditableSurfaceMode): void;
}

interface SurfaceMembers extends BpmnSurfaceHandle, PendingInputHandle {
    /** Block bodies matter: the listener's return value is ignored. */
    onCommandStackChanged(listener: () => void): () => void;
}

/** @experimental A readonly surface on `NavigatedViewer`. */
export interface ViewingSurface extends SurfaceMembers {
    readonly base: "viewer";
    getService<K extends keyof ViewingSurfaceServices>(name: K): ViewingSurfaceServices[K];
    getService<T = unknown>(name: string): T;
}

/** @experimental An editing surface on `Modeler`. */
export interface EditingSurface extends SurfaceMembers {
    readonly base: "modeler";
    getService<K extends keyof CoreModelerServices>(name: K): CoreModelerServices[K];
    getService<T = unknown>(name: string): T;
    /** Opens the `diagramTemplate` slot's XML, or bpmn-js's empty diagram without one. */
    newDiagram(): Promise<ImportXMLResult>;
}

/** @experimental An editing surface built with a `mode`; it shares `base: "modeler"`. */
export interface ModalSurface extends EditingSurface {
    setMode(mode: EditableSurfaceMode): void;
    getMode(): EditableSurfaceMode;
}

/** @experimental */
export type BpmnSurface = ViewingSurface | EditingSurface | ModalSurface;
