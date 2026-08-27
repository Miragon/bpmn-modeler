import type { ReferenceKind } from "./extractReference";

/**
 * A resolvable model reference the context-pad entry navigates to: the
 * process / decision id plus the {@link ReferenceKind} that tells the host
 * which file type to look for.
 */
export interface ModelReference {
    id: string;
    kind: ReferenceKind;
}

/**
 * The single host capability this library needs. The consumer supplies an
 * implementation (in the VS Code webview it posts a protocol command; a
 * host-less consumer resolves the reference itself), so the library never
 * imports the postMessage protocol and registering the provider without a
 * host is unrepresentable — no port, no module (see {@link createModelNavigationModule}).
 */
export interface ModelNavigationPort {
    /**
     * Fire-and-forget from the modeler's side: the return type is widened to
     * `void | Promise<void>` so a host can resolve the target asynchronously
     * (e.g. a GitHub-API lookup before opening a tab) without changing the
     * contract — the modeler never awaits it. Popup-blocker handling stays the
     * host's problem.
     */
    openReference(reference: ModelReference): void | Promise<void>;
}
