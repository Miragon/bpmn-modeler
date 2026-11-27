import type { CodeLinkMapClient } from "./CodeLinkMapClient";

/** A surface's DI injector, such as `surface.getService("injector")`. */
export interface CodeLinkInjector {
    get<T>(name: string, strict: false): T | null;
}

/** A surface built without code link ignores the host's status pushes. */
export function applyImplementationStatus(
    injector: CodeLinkInjector,
    resolved: Record<string, boolean>,
): void {
    injector
        .get<Pick<CodeLinkMapClient, "applyStatus">>("codeLinkMapClient", false)
        ?.applyStatus(resolved);
}
