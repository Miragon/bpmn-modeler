import type { Engine } from "@miragon/bpmn-modeler-types";
import type { LintCallbacks } from "./bpmnlint/LintConfigService";
import type { LintingOptions } from "./publicApi";

// Fires at most once per page: an omitted `linting` used to enable in-page
// linting, so a silent upgrade would strip a consumer's linter without a word.
let migrationNoticeShown = false;

/**
 * Resolves the bpmnlint DI module(s) for the chosen tier from the host-injected
 * {@link LintModule}. Pure and synchronous — the lint stack is no longer fetched
 * by the package; the host owns the `@miragon/bpmn-modeler/lint` import.
 *
 * - `undefined` — no module, plus a one-time `console.info` migration nudge (an
 *   omitted `linting` enabled in-page linting before injection).
 * - `false` — no module, silent.
 * - `{ module, config? }` — one in-page module carrying the engine + config.
 * - `{ module, results: "external" }` — one external module (no config); it
 *   paints host-pushed results and services the `startInPageLinting` handback.
 */
export function buildLintModules(
    linting: LintingOptions | undefined,
    engine: Engine,
    callbacks: LintCallbacks,
): unknown[] {
    if (linting === undefined) {
        if (!migrationNoticeShown) {
            migrationNoticeShown = true;
            console.info(
                "@miragon/bpmn-modeler: linting is off because no lint module was supplied. " +
                    'Pass `linting: { module: await import("@miragon/bpmn-modeler/lint") }` to ' +
                    "enable in-page linting, or `linting: false` to silence this notice.",
            );
        }
        return [];
    }
    if (linting === false) {
        return [];
    }

    // Only `{ results: "external" }` opts out of in-page; narrowing on `results`
    // keeps `config` off the external variant.
    let tier: "external" | "in-page" = "in-page";
    let config;
    if (linting.results === "external") {
        tier = "external";
    } else {
        config = linting.config;
    }
    return [linting.module.createLintModule({ tier, engine, config }, callbacks)];
}
