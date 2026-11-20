import { StoredCredentialsQuery, type MessageOfType } from "@miragon/bpmn-modeler-shared";

import type { PreviewTargets } from "./targetsPreview";

/** The preview stores no secrets: it answers with the target's auth settings only. */
export function storedCredentialsOf(
    targets: PreviewTargets,
    { targetName, requestId }: MessageOfType<"RequestStoredCredentialsCommand">,
): StoredCredentialsQuery {
    return new StoredCredentialsQuery(targets.authOf(targetName), targetName, requestId);
}
