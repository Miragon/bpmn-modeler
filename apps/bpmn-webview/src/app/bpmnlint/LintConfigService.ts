import { LintConfigSanitizerService } from "./LintConfigSanitizerService";
import { lintingRuleResolver } from "./LintingRuleResolver";

/**
 * bpmn-js DI service (registered by {@link LintModule}) that applies a discovered
 * `.bpmnlintrc` to the `bpmn-js-bpmnlint` linter at runtime. Injected with the
 * `linting` service and the {@link LintConfigSanitizerService}, so the whole bpmnlint
 * concern stays composed inside the DI module — the host's config is routed here
 * from the webview message hub.
 */
export class LintConfigService {
    static $inject = ["linting", "bpmnLintSanitizer"];

    constructor(
        private readonly linting: any,
        private readonly sanitizer: LintConfigSanitizerService,
    ) {}

    /**
     * Applies the discovered `.bpmnlintrc` (`raw`, sanitised by the injected
     * {@link LintConfigSanitizerService}) to the linter, or deactivates linting
     * when `raw` is `null`. Returns warnings for any dropped entries.
     */
    apply(raw: Record<string, unknown> | null): string[] {
        if (!raw) {
            if (this.linting.isActive()) {
                this.linting.toggle(false);
            }
            document.body.classList.remove("bpmnlint-active");
            return [];
        }

        const { config, warnings } = this.sanitizer.sanitize(raw);
        this.linting.setLinterConfig({ config, resolver: lintingRuleResolver });
        if (!this.linting.isActive()) {
            this.linting.toggle(true);
        }
        document.body.classList.add("bpmnlint-active");
        return warnings;
    }
}
