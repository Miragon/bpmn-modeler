import type { ReferenceKind } from "@miragon/bpmn-modeler-types";

/**
 * A resolvable model reference the context-pad entry navigates to: the
 * process / decision / form id plus the {@link ReferenceKind} that tells the host
 * which file type to look for.
 */
export interface ModelReference {
    id: string;
    kind: ReferenceKind;
}

export interface PreviewRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface FormPreviewAnchor {
    task: PreviewRect;
    canvas: PreviewRect;
    contextPad?: PreviewRect;
}
export interface FormPreviewRequest {
    id: string;
    /** Automatic previews must not prompt for target selection. */
    automatic: boolean;
    /** Show unresolved-reference feedback without requesting saved bytes. */
    unavailable?: boolean;
    anchor(): FormPreviewAnchor;
    onVisibilityChanged(visible: boolean): void;
    onClose(): void;
    onExplicitRequest?(): void;
    focusCanvas(): void;
}
export interface FormPreviewHandle {
    close(): void;
    reposition(): void;
}
export interface FormPreviewPort {
    open(request: FormPreviewRequest): FormPreviewHandle;
}

/**
 * The single host capability this library needs. The consumer supplies an
 * implementation (in the VS Code webview it posts a protocol command; a
 * host-less consumer resolves the reference itself), so the library never
 * imports the postMessage protocol and registering the provider without a
 * host is unrepresentable — no port, no module (see {@link createModelNavigationModule}).
 */
export interface ModelNavigationPort {
    /** Lifecycle-managed anchored preview; selection and dismissal belong to the modeler. */
    formPreview?: FormPreviewPort;
    /**
     * Fire-and-forget from the modeler's side: the return type is widened to
     * `void | Promise<void>` so a host can resolve the target asynchronously
     * (e.g. a GitHub-API lookup before opening a tab) without changing the
     * contract — the modeler never awaits it. Popup-blocker handling stays the
     * host's problem.
     */
    openReference(reference: ModelReference): void | Promise<void>;

    /**
     * Optionally controls whether an action is shown for a reference. Omitting
     * this hook treats every syntactically valid reference as available.
     * Implementations must answer synchronously because bpmn-js builds context
     * pad entries synchronously.
     */
    isReferenceAvailable?(reference: ModelReference): boolean;

    /** False while the initial availability index is pending; omitted means known. */
    isReferenceAvailabilityKnown?(): boolean;

    /**
     * Optionally notifies the modeler that availability changed so an open
     * context pad can refresh immediately.
     */
    onReferenceAvailabilityChanged?(listener: () => void): () => void;
}
