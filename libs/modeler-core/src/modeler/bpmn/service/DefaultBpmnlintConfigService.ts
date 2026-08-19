import { Engine } from "@miragon/bpmn-modeler-shared";

const BASE_EXTENDS = ["bpmnlint:recommended", "plugin:miragon/recommended"];

const C7_ENGINE_LAYER = "plugin:camunda-compat/camunda-platform-7-24";
const C8_ENGINE_LAYER = "plugin:camunda-compat/camunda-cloud-8-10";

/**
 * Builds the zero-config **default** bpmnlint config, used when no `.bpmnlintrc`
 * is found from the document up to the workspace root, so a diagram gets baseline
 * validation for free (issue #1327). A workspace `.bpmnlintrc` — even `{}` — is
 * still nearest-config-wins and never reaches here.
 *
 * The config is layered, mirroring Camunda's `@camunda/linting`:
 * - `bpmnlint:recommended` — shared generic BPMN correctness (missing start/end
 *   event, disconnected element, fake join, …), identical for every engine;
 * - `plugin:miragon/recommended` — our thin, non-engine opinion layer, wired in but
 *   currently empty (see {@link bundledDefaultResolver});
 * - `plugin:camunda-compat/<platform-version>` — the engine deployability matrix,
 *   added **only when a platform is detected**. A platform-less file (externally
 *   authored / legacy, no `zeebe:`/`camunda:` markers) gets the structural base
 *   alone, since we can't know which engine's rules apply.
 *
 * All rules and configs resolve from the host-bundled {@link bundledDefaultResolver}
 * (the workspace has none installed), and the engine layer's moddle descriptor is
 * embedded directly so a config-less workspace can still parse the typed
 * `zeebe:`/`camunda:` properties those rules inspect.
 */
export class DefaultBpmnlintConfigService {
    async build(platform: Engine | undefined): Promise<Record<string, unknown>> {
        switch (platform) {
            case "c7":
                return {
                    extends: [...BASE_EXTENDS, C7_ENGINE_LAYER],
                    moddleExtensions: { camunda: await this.loadCamundaModdle() },
                };
            case "c8":
                return {
                    extends: [...BASE_EXTENDS, C8_ENGINE_LAYER],
                    moddleExtensions: { zeebe: await this.loadZeebeModdle() },
                };
            default:
                return { extends: [...BASE_EXTENDS] };
        }
    }

    private loadZeebeModdle(): Promise<unknown> {
        return this.unwrapDescriptor(import("zeebe-bpmn-moddle/resources/zeebe.json"));
    }

    private loadCamundaModdle(): Promise<unknown> {
        return this.unwrapDescriptor(import("camunda-bpmn-moddle/resources/camunda.json"));
    }

    /**
     * Normalises a dynamic moddle-descriptor JSON import — the same shape
     * {@link ScriptXmlService} uses. The `import(...)` literal stays at the call site
     * so both bundlers (webpack for VS Code, Bun for the bridge) include the JSON;
     * `resolveJsonModule` is off, so the module is typed by an ambient shim and may
     * expose the descriptor under `default` or the module itself depending on interop.
     */
    private async unwrapDescriptor(imported: Promise<unknown>): Promise<unknown> {
        const mod = (await imported) as { default?: unknown };
        return mod.default ?? mod;
    }
}
