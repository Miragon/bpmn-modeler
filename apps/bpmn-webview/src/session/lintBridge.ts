import type { LintingOptions } from "@miragon/bpmn-modeler";
import {
    type BpmnlintInPageQuery,
    type BpmnlintResultsQuery,
    SetLintingEnabledCommand,
    UpdateLintResultsCommand,
} from "@miragon/bpmn-modeler-shared";
import type { LintRunEvent } from "@miragon/bpmn-modeler-types";

import { isLintingHandle, type SurfaceHandle } from "../surface";
import { loadLintModule } from "../surfaceModules";
import type { HostChannel } from "./hostChannel";

interface SurfaceLintOptions {
    linting: LintingOptions;
    onLintResults: (event: LintRunEvent) => void;
    onLintingToggled: (enabled: boolean) => void;
}

interface LintReplyHandlers {
    BpmnlintResultsQuery(query: BpmnlintResultsQuery): void;
    BpmnLintDisabledQuery(): void;
    BpmnlintInPageQuery(query: BpmnlintInPageQuery): void;
}

export interface LintBridge {
    /** `/lint` is imported lazily and cached, so building these per (re)creation is free after the first. */
    surfaceOptions(): Promise<SurfaceLintOptions>;
    readonly handlers: LintReplyHandlers;
}

/** Real hosts run the linter themselves and push results, so the default tier is external. */
export function createLintBridge(
    host: HostChannel,
    injected: {
        linting: LintingOptions | undefined;
        onLintResults: ((event: LintRunEvent) => void) | undefined;
    },
    getSurface: () => SurfaceHandle,
): LintBridge {
    // The opaque config-version token from the host's last BpmnlintInPageQuery,
    // echoed back on every UpdateLintResultsCommand so the host can pair a run
    // with the config version it linted and drop a stale run. `undefined` for
    // the payload-free default tier (and reset to it on config→no-config).
    //
    // Pairing is race-free without any per-run plumbing: BrowserLinter.run is a
    // pure microtask chain (bpmnlint over the in-memory tree, no I/O), so it
    // drains to its onLintResults synchronously-after-await, before the next host
    // message can be delivered as a fresh macrotask and swap this token. So the
    // token read here always belongs to the config that drove this very run.
    let currentConfigToken: string | undefined;

    const publishLintResults = (event: LintRunEvent): void =>
        host.postMessage(
            new UpdateLintResultsCommand(event.results, [...event.unresolved], currentConfigToken),
        );

    return {
        surfaceOptions: async () => ({
            linting: injected.linting ?? { results: "external", module: await loadLintModule() },
            onLintResults: injected.onLintResults ?? publishLintResults,
            onLintingToggled: (enabled) => host.postMessage(new SetLintingEnabledCommand(enabled)),
        }),
        handlers: {
            BpmnlintResultsQuery: (query) => {
                const surface = getSurface();
                if (isLintingHandle(surface)) {
                    surface.applyLintResults(query.results);
                }
            },
            BpmnLintDisabledQuery: () => {
                const surface = getSurface();
                if (isLintingHandle(surface)) {
                    surface.applyLintingDisabled();
                }
            },
            BpmnlintInPageQuery: (query) => {
                // Dedup of a repeat covered instruction lives in LintConfigService,
                // where the tier state is known, so a stale token from an
                // intervening disabled push cannot drop a re-enable.
                currentConfigToken = query.configToken;
                // No workspace config → the surface's mode default (engine-aware
                // in Implement, engine-neutral in Design); a covered config →
                // lint it in-page.
                const surface = getSurface();
                if (isLintingHandle(surface)) {
                    surface.startInPageLinting(query.config, query.configToken);
                }
            },
        },
    };
}
