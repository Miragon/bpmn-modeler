import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";
import { Engine } from "@miragon/bpmn-modeler-types";

/**
 * Builds the zero-config **default** bpmnlint config, used when no `.bpmnlintrc`
 * is found from the document up to the workspace root, so a diagram gets baseline
 * validation for free (issue #1327). A workspace `.bpmnlintrc` — even `{}` — is
 * still nearest-config-wins and never reaches here.
 *
 * The layered config comes from `@miragon/bpmnlint-plugin-rules`'
 * {@link getDefaultLintConfig}. We always request the `modeling` Miragon layer
 * (`plugin:@miragon/rules/recommended-for-modeling` — layout hints at `warn`, id
 * conventions off), decoupled from the engine so a Camunda diagram is not held to
 * the stricter automation bar in the zero-config path. The engine still adds its
 * `plugin:camunda-compat/*` deployability layer and typed moddle descriptor when
 * given. All of it resolves from the bundled resolver in {@link NodeBpmnLinter}
 * (the workspace has none installed).
 */
export class DefaultBpmnlintConfigService {
    async build(platform: Engine | undefined): Promise<Record<string, unknown>> {
        return getDefaultLintConfig({ engine: platform, preset: "modeling" }) as Record<
            string,
            unknown
        >;
    }
}
