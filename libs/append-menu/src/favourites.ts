import type { AppendMenuOverride } from "./AppendMenuOverride";

/** A surface's DI injector, such as `surface.getService("injector")`. */
export interface AppendMenuInjector {
    get<T>(name: string, strict: false): T | null;
}

/** A surface built without the append menu ignores favourites. */
export function applyFavouriteBpmnElements(
    injector: AppendMenuInjector,
    types: readonly string[],
): void {
    injector
        .get<Pick<AppendMenuOverride, "setFavourites">>("appendMenuOverride", false)
        ?.setFavourites([...types]);
}
