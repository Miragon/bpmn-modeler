import { env, Memento, Uri, window } from "vscode";

import { LoggerPort } from "@miragon/bpmn-modeler-core";

const RELEASES_BASE = "https://github.com/Miragon/bpmn-modeler/releases/tag";
const LAST_NOTIFIED_KEY = "lastNotifiedVersion";
const VIEW_RELEASE_NOTES = "View Release Notes";

/**
 * Offers the release notes once per installed version. The returned promise
 * settles when the prompt is done and never rejects; failures are logged.
 */
export function notifyIfNewRelease(
    currentVersion: string,
    globalState: Memento,
    logger: LoggerPort,
): Promise<void> {
    if (globalState.get<string>(LAST_NOTIFIED_KEY) === currentVersion) {
        return Promise.resolve();
    }

    const logError = (error: unknown) =>
        logger.logError(error instanceof Error ? error : new Error(String(error)));

    // Persist before showing so a crash/dismiss never re-triggers the prompt.
    // A rejected update means the prompt may repeat next launch — log it rather
    // than let the write float away silently.
    const remembering = globalState.update(LAST_NOTIFIED_KEY, currentVersion);
    const persisted = Promise.resolve(remembering).catch(logError);

    const prompted = Promise.resolve(
        window.showInformationMessage(
            `BPMN Modeler updated to v${currentVersion}. See what's new!`,
            VIEW_RELEASE_NOTES,
        ),
    )
        .then((selection) => {
            if (selection === VIEW_RELEASE_NOTES) {
                return env.openExternal(Uri.parse(`${RELEASES_BASE}/vscode-v${currentVersion}`));
            }
            return undefined;
        })
        .then(undefined, logError);

    return Promise.all([persisted, prompted]).then(() => undefined);
}
