import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";
import { Engine } from "@miragon/bpmn-modeler-shared";

/**
 * Builds the zero-config **default** bpmnlint config, used when no `.bpmnlintrc`
 * is found from the document up to the workspace root, so a diagram gets baseline
 * validation for free (issue #1327). A workspace `.bpmnlintrc` — even `{}` — is
 * still nearest-config-wins and never reaches here.
 *
 * The layered config (`bpmnlint:recommended` + `plugin:@miragon/rules/recommended` + the
 * matching `plugin:camunda-compat/*` engine layer, with the engine's moddle
 * descriptor embedded) now comes from `@miragon/bpmnlint-plugin-rules`'
 * {@link getDefaultLintConfig}. All of it resolves from the bundled resolver in
 * {@link NodeBpmnLinter} (the workspace has none installed).
 *
 * On top of the package default, the Miragon `flow-through-element` rule — a
 * sequence flow routed through an unrelated shape's body — is switched on; the
 * other Miragon rules stay off (their package default).
 */
export class DefaultBpmnlintConfigService {
    async build(platform: Engine | undefined): Promise<Record<string, unknown>> {
        const config = getDefaultLintConfig({ engine: platform }) as Record<string, unknown>;
        const rules = (config.rules ?? {}) as Record<string, unknown>;
        return {
            ...config,
            rules: { ...rules, "@miragon/rules/flow-through-element": "warn" },
        };
    }
}
