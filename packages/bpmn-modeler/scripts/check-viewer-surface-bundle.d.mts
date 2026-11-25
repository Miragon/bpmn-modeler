export interface ViewerSurfaceSignalOptions {
    featureDirs?: string[];
    packageDir?: string;
}

export function viewerSurfaceEntry(base?: string): string;

export function featureLibraryDirs(repoRoot?: string): string[];

export function modulesOutsideViewerSurface(
    moduleIds: string[],
    options?: ViewerSurfaceSignalOptions,
): string[];

export function missingViewerSurfaceControls(
    moduleIds: string[],
    options?: Pick<ViewerSurfaceSignalOptions, "packageDir">,
): string[];

export function bundledModuleIds(code: string): Promise<string[]>;

export function checkViewerSurfaceBundle(options?: { code?: string }): Promise<{ modules: number }>;
