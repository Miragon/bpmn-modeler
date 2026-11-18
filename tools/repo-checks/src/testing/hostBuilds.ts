import { requireMatches, type SourceFile, type Workspace } from "@miragon/architecture-testing";

import { stagingFolders, viteStagingFolder } from "./webviewStaging";

export interface WebviewApp {
    readonly webview: string;
    readonly dir: string;
    readonly packageName: string;
    readonly stagingFolder: string;
}

export interface HostBuild {
    readonly name: string;
    readonly buildFile: string;
    readonly unwrittenFolders: readonly string[];
    readonly shipped: readonly WebviewApp[];
    readonly notShipped: readonly WebviewApp[];
}

/**
 * The apps whose Vite build writes a staging folder. The staging folder
 * decides, not the dir name, so a copy of a folder no app writes fails.
 */
export function webviewAppsOf(
    workspaces: readonly Workspace[],
    viteConfigOf: (dir: string) => SourceFile | undefined,
): WebviewApp[] {
    return requireMatches(
        "apps whose Vite build writes dist/webview-staging",
        workspaces.flatMap(({ name, dir }) => {
            const viteConfig = dir.startsWith("apps/") ? viteConfigOf(dir) : undefined;
            const stagingFolder = viteConfig && viteStagingFolder(viteConfig);
            return stagingFolder === undefined
                ? []
                : [{ webview: dir.slice("apps/".length), dir, packageName: name, stagingFolder }];
        }),
    );
}

/** Only a host's build decides which webviews it ships. */
export function hostBuildOf(
    name: string,
    buildFile: SourceFile,
    webviewApps: readonly WebviewApp[],
): HostBuild {
    const folders = stagingFolders(buildFile);
    return {
        name,
        buildFile: buildFile.path,
        unwrittenFolders: folders.filter(
            (folder) => !webviewApps.some((app) => app.stagingFolder === folder),
        ),
        shipped: webviewApps.filter((app) => folders.includes(app.stagingFolder)),
        notShipped: webviewApps.filter((app) => !folders.includes(app.stagingFolder)),
    };
}
