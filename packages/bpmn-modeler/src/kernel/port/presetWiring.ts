/**
 * What composition hands a preset facade, which may not import the modules
 * itself: the kernel's default modules and the clipboard feature's.
 * Goes in #2802 S4, when the facades build on `createSurface`.
 */
export interface PresetWiring {
    readonly defaultModules: readonly unknown[];
    /** Empty without a `clipboard` option. */
    readonly clipboardModules: readonly unknown[];
}
