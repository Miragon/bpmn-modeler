/**
 * What composition hands a preset facade, which may not import the modules
 * itself: the kernel's default modules and the clipboard feature's.
 */
export interface PresetWiring {
    readonly defaultModules: readonly unknown[];
    /** Empty without a `clipboard` option. */
    readonly clipboardModules: readonly unknown[];
}
