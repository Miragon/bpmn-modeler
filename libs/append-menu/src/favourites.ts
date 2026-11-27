import type { AppendMenuOverride } from "./AppendMenuOverride";

/** A surface's DI injector, such as `surface.getService("injector")`. */
export interface AppendMenuInjector {
    get<T>(name: string, strict: false): T | null;
}

function appendMenuOverrideOf(
    injector: AppendMenuInjector,
): Pick<AppendMenuOverride, "setFavourites"> | null {
    return injector.get<Pick<AppendMenuOverride, "setFavourites">>("appendMenuOverride", false);
}

export function hasAppendMenu(injector: AppendMenuInjector): boolean {
    return appendMenuOverrideOf(injector) !== null;
}

/** A surface built without the append menu ignores favourites. */
export function applyFavouriteBpmnElements(
    injector: AppendMenuInjector,
    types: readonly string[],
): void {
    appendMenuOverrideOf(injector)?.setFavourites([...types]);
}
