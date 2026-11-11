import { LOCAL_HOST } from "@miragon/bpmn-modeler-core";

import { UriParts } from "./canonicalPath";

const REMOTE_SCHEME = "vscode-remote";

/**
 * The host part of an allowance found in this window. `remoteName` names only
 * the kind of remote; a remote folder's authority (`ssh-remote+box`,
 * `dev-container+<hex>`, `wsl+Ubuntu`) tells two machines or containers apart.
 */
export function originHostOf(remoteName: string | undefined, folders: readonly UriParts[]): string {
    if (remoteName === undefined) {
        return LOCAL_HOST;
    }
    const remoteFolder = folders.find(
        ({ scheme, authority }) => scheme === REMOTE_SCHEME && authority !== "",
    );
    return remoteFolder?.authority ?? remoteName;
}
