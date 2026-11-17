import { ElementIdConventionQuery } from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import type { LintConfigVersion } from "../domain/LintSession";
import type { LintRunnerPort } from "../port/bpmnPorts";

/**
 * Sends each webview the options its lint config gives `element-id-naming`,
 * whether or not linting runs, so IDs generated from names never break the
 * rule. A malformed config reaches the user through the lint run instead.
 */
export class ElementIdConventionService {
    /** The options each webview last received, so unchanged ones are not sent again. */
    private readonly sent = new Map<string, string>();
    private readonly latestRuns = new Map<string, symbol>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly lintRunner: Pick<LintRunnerPort, "elementIdConventionOptions">,
        private readonly notifier: NotifierPort,
    ) {}

    /** Only the newest push of an editor sends; runs can finish out of order. */
    async push(
        editorId: string,
        nearestConfig: Promise<LintConfigVersion | undefined>,
    ): Promise<void> {
        const run = Symbol(editorId);
        this.latestRuns.set(editorId, run);
        try {
            const version = await nearestConfig;
            const options = version
                ? await this.lintRunner.elementIdConventionOptions(
                      version.configPath,
                      version.config as Record<string, unknown>,
                  )
                : {};
            const sent = JSON.stringify(options);
            if (this.latestRuns.get(editorId) !== run || this.sent.get(editorId) === sent) {
                return;
            }
            if (
                await this.editorStore.postMessage(editorId, new ElementIdConventionQuery(options))
            ) {
                this.sent.set(editorId, sent);
            }
        } catch (error) {
            this.notifier.logDebug(
                `[bpmnlint] element ID convention not sent: ${(error as Error).message}`,
            );
        }
    }

    /** A reloaded webview lost the convention, so the next push sends it even when unchanged. */
    forgetSent(editorId: string): void {
        this.sent.delete(editorId);
    }

    /** The teardown for a closing editor. */
    release(editorId: string): void {
        this.sent.delete(editorId);
        this.latestRuns.delete(editorId);
    }
}
