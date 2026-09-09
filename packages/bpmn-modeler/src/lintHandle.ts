import type { BpmnlintConfig, LintResults } from "@miragon/bpmn-modeler-types";

import type { LintConfigService } from "./bpmnlint/LintConfigService";

/**
 * The three lint handle methods {@link BpmnModeler} and {@link BpmnDesigner}
 * expose. Signature-identical on both surfaces so the designer handle stays a
 * subset of the modeler handle (asserted in `publicApi.spec.ts`).
 */
export interface LintHandleMethods {
    applyLintResults(results: LintResults | null): void;
    applyLintingDisabled(): void;
    startInPageLinting(config?: BpmnlintConfig, configToken?: string): void;
}

/**
 * Builds the shared host-adapter lint methods over a defensively-resolved
 * {@link LintConfigService}. `resolveService` returns `undefined` for a surface
 * created without a lint module (`get("bpmnLintConfig", false)`), in which case
 * every method is a no-op that warns — a stray host push must never throw.
 *
 * Type-only imports keep this module design-pure (it references the lint service
 * type but never the lint stack), so both `/design` and the root entry can
 * delegate here instead of duplicating the ~40-line boilerplate.
 */
export function createLintHandleMethods(
    resolveService: () => LintConfigService | undefined,
    warn: (message: string) => void,
): LintHandleMethods {
    const ignore = (action: string): void =>
        warn(`${action} ignored: this surface was created without a lint module`);

    return {
        applyLintResults(results) {
            const service = resolveService();
            if (!service) {
                ignore("applyLintResults");
                return;
            }
            service.applyLintResults(results);
        },
        applyLintingDisabled() {
            const service = resolveService();
            if (!service) {
                ignore("applyLintingDisabled");
                return;
            }
            service.applyLintingDisabled();
        },
        startInPageLinting(config, configToken) {
            const service = resolveService();
            if (!service) {
                ignore("startInPageLinting");
                return;
            }
            service.startInPageLinting(config, configToken);
        },
    };
}
