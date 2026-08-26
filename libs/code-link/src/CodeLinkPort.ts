import type { ImplementationKind } from "./extractImplementation";
import type { ImplementationEntry } from "@miragon/bpmn-modeler-types";

/**
 * The host capabilities this library needs. The consumer supplies an
 * implementation (in the VS Code webview both calls post protocol commands),
 * so the library never imports the postMessage protocol and registering its
 * providers without a host is unrepresentable — no port, no module (see
 * {@link createCodeLinkModule}).
 *
 * `ImplementationEntry` is a type-only import from the protocol-free
 * `@miragon/bpmn-modeler-types` package (#1371).
 */
export interface CodeLinkPort {
    /** Open the workspace source file the reference resolves to. */
    navigateToImplementation(reference: string, kind: ImplementationKind): void;

    /** Ship the diagram's current implementation references for status resolution. */
    syncActivities(entries: ImplementationEntry[]): void;
}
