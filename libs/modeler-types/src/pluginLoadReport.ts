/**
 * What a page that loads BPMN plugins tells its host about the load, so every
 * page that loads them (the BPMN webview, an isolated plugin frame) uses the
 * same words.
 */
export interface PluginLoadReport {
    readonly logLines: readonly string[];
    /** One notice for the whole load; `undefined` when nothing needs the user. */
    readonly notice: string | undefined;
}

interface PluginLoadOutcome {
    readonly failures: readonly { readonly plugin: string; readonly reason: string }[];
    readonly ignored: readonly { readonly plugin: string; readonly type: string }[];
}

export function pluginLoadReport({ failures, ignored }: PluginLoadOutcome): PluginLoadReport {
    return {
        logLines: [
            ...failures.map(({ plugin, reason }) => `BPMN plugin "${plugin}" left out: ${reason}`),
            ...ignored.map(
                ({ plugin, type }) =>
                    `BPMN plugin "${plugin}" registers "${type}", which this editor does not run`,
            ),
        ],
        notice: failureNotice(failures.length),
    };
}

const CONSTRUCTION_FAILURE =
    "The BPMN plugins stopped the editor from opening, so it opened without them";

export function pluginConstructionFailureReport(error: unknown): PluginLoadReport {
    return wholeLoadFailureReport(CONSTRUCTION_FAILURE, error);
}

const LOADER_FAILURE = "The BPMN plugins could not be loaded, so the editor opens without them";

/** The loader itself failed (its chunk did not load, or it threw), so no plugin is loaded. */
export function pluginLoaderFailureReport(error: unknown): PluginLoadReport {
    return wholeLoadFailureReport(LOADER_FAILURE, error);
}

function wholeLoadFailureReport(failure: string, error: unknown): PluginLoadReport {
    const reason = error instanceof Error ? error.message : String(error);
    return {
        logLines: [`${failure}: ${reason}`],
        notice: `${failure}. See the log for details.`,
    };
}

function failureNotice(failedCount: number): string | undefined {
    if (failedCount === 0) {
        return undefined;
    }
    return failedCount === 1
        ? "A BPMN plugin could not be loaded and is left out. See the log for details."
        : `${failedCount} BPMN plugins could not be loaded and are left out. See the log for details.`;
}
