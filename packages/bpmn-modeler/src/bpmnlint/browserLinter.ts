import type {
    BpmnlintConfig,
    Engine,
    LintResults,
    LintRunEvent,
} from "@miragon/bpmn-modeler-types";
import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";
import { Linter } from "bpmnlint";

import { RecordingBrowserResolver, staticUnresolvedModdleExtensions } from "./browserResolver";

/**
 * Runs bpmnlint against the *live* bpmn-js definitions tree, in the browser.
 *
 * This is the in-page tier: instead of the host running a linter and pushing
 * results down, the webview lints itself. The config is either an explicit
 * `{config}` a consumer supplied or the engine-aware zero-config default
 * (`getDefaultLintConfig({engine, preset: "modeling"})`, matching the hosts'
 * preset for parity). Rules the bundled resolver cannot cover degrade to no-ops
 * and are reported via {@link LintRunEvent.unresolved}, so an unusual `{config}`
 * is never fatal.
 *
 * The resolver is created once and reused; each {@link run} resets its recorded
 * misses so the emitted `unresolved` reflects that single lint. `moddleExtensions`
 * the browser cannot honour are computed once at construction (the config is
 * immutable for the instance's life) and merged into every run's `unresolved`.
 */
export class BrowserLinter {
    private readonly config: BpmnlintConfig;

    private readonly resolver = new RecordingBrowserResolver();

    private readonly staticUnresolved: string[];

    constructor(engine: Engine, config?: BpmnlintConfig) {
        this.config = config ?? getDefaultLintConfig({ engine, preset: "modeling" });
        this.staticUnresolved = staticUnresolvedModdleExtensions(this.config);
    }

    /**
     * Lints the given definitions tree and returns the rule-keyed results plus the
     * rules/configs/moddleExtensions that could not be resolved. `definitions` is
     * the moddle root bpmn-js hands to its own `Linting.lint` — already parsed with
     * every registered extension, so bpmnlint walks it without re-reading XML.
     */
    async run(definitions: unknown): Promise<LintRunEvent> {
        this.resolver.reset();
        const linter = new Linter({ config: this.config, resolver: this.resolver });
        const results = (await linter.lint(definitions)) as LintResults;
        return {
            results,
            unresolved: [...this.resolver.unresolved, ...this.staticUnresolved],
        };
    }
}
