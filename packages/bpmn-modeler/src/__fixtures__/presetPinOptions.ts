// The option values the preset pin specs build with. Ports, bridges and callbacks are named
// after their slots, so a value handed to the wrong DI name reads as crossed in the pins.
import { vi } from "vitest";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda.json";
import zeebeModdle from "zeebe-bpmn-moddle/resources/zeebe.json";
import type { CodeLinkPort } from "@miragon/bpmn-modeler-code-link";
import type { DefinitionSearchPort } from "@miragon/bpmn-modeler-definition-search";
import type { InlineScriptingPort } from "@miragon/bpmn-modeler-inline-scripting";
import type { ModelNavigationPort } from "@miragon/bpmn-model-navigation";
import type { ClipboardBridge } from "@miragon/bpmn-modeler-clipboard";
import type { BpmnlintConfig, Engine } from "@miragon/bpmn-modeler-types";

import * as lintModule from "../lint";

export { lintModule };
import type { CreateModelerOptions } from "../modeler/port/publicApi";

export type OptionVariant<O> = readonly [label: string, options: Partial<O>];

export const modelNavigation: ModelNavigationPort = { openReference: vi.fn() };
const codeLink: CodeLinkPort = { navigateToImplementation: vi.fn(), syncActivities: vi.fn() };
export const definitionSearch: DefinitionSearchPort = { search: vi.fn(async () => []) };
const scripting: InlineScriptingPort = { openScriptEditor: vi.fn(), scriptSourceChanged: vi.fn() };
export const bridge: ClipboardBridge = {
    requestClipboard: vi.fn(async () => ""),
    writeClipboard: vi.fn(),
};
export const textBridge: ClipboardBridge = {
    requestClipboard: vi.fn(async () => ""),
    writeClipboard: vi.fn(),
};
export const VALUE_ROLES = new Map<object, string>([
    [modelNavigation, "modelNavigation port"],
    [codeLink, "codeLink port"],
    [definitionSearch, "definitionSearch port"],
    [scripting, "scripting port"],
    [bridge, "clipboard bridge"],
    [textBridge, "clipboard text bridge"],
]);

export const CALLER_MODULE = { callerProbe: ["value", "caller"] };
export const ACME_MODDLE = {
    name: "Acme",
    prefix: "acme",
    uri: "http://acme.example/bpmn",
    types: [],
};
const ENGINE_MODDLE: Record<Engine, { readonly prefix: string; readonly moddle: unknown }> = {
    c7: { prefix: "camunda", moddle: camundaModdle },
    c8: { prefix: "zeebe", moddle: zeebeModdle },
};
const LINT_CONFIG: BpmnlintConfig = { rules: { "label-required": "off" } };
export const onLintResults = (): undefined => undefined;
export const onLintingToggled = (): undefined => undefined;

export const LINT_VARIANTS = [
    ["linting: false", { linting: false }],
    ["linting: { module } (in-page tier)", { linting: { module: lintModule } }],
    [
        'linting: { module, results: "external" }',
        { linting: { module: lintModule, results: "external" } },
    ],
] as const;

export const PREVIEW_TEMPLATES: Record<Engine, object> = {
    c7: {
        $schema: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
        name: "Pinned task",
        id: "com.example.pinned",
        appliesTo: ["bpmn:ServiceTask"],
        properties: [],
    },
    c8: {
        $schema:
            "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
        name: "Pinned task",
        id: "com.example.pinned",
        appliesTo: ["bpmn:ServiceTask"],
        properties: [],
    },
};

export function modelerVariants(engine: Engine): readonly OptionVariant<CreateModelerOptions>[] {
    const { prefix, moddle } = ENGINE_MODDLE[engine];
    return [
        ...LINT_VARIANTS,
        [
            'linting: { module } (in-page tier) with mode: "design"',
            { linting: { module: lintModule }, mode: "design" },
        ],
        [
            "linting: { module, config }, onLintResults, onLintingToggled and elementTemplates",
            {
                linting: { module: lintModule, config: LINT_CONFIG },
                onLintResults,
                onLintingToggled,
                elementTemplates: [PREVIEW_TEMPLATES[engine]],
            },
        ],
        ['mode: "design"', { mode: "design" }],
        ["capabilities.modelNavigation", { capabilities: { modelNavigation } }],
        ["capabilities.codeLink", { capabilities: { codeLink } }],
        ["capabilities.definitionSearch", { capabilities: { definitionSearch } }],
        ["capabilities.scripting", { capabilities: { scripting } }],
        ["clipboard: { bridge }", { clipboard: { bridge } }],
        ["clipboard: { bridge, text }", { clipboard: { bridge, text: textBridge } }],
        [
            "moddleExtensions (a new prefix, and the engine's prefix replaced)",
            {
                moddleExtensions: {
                    acme: ACME_MODDLE,
                    [prefix]: Object.assign({}, moddle, {
                        uri: `http://override.example/${prefix}`,
                    }),
                },
            },
        ],
        ["additionalModules", { additionalModules: [CALLER_MODULE] }],
        [
            "in-page linting, every capability, clipboard and additionalModules at once",
            {
                linting: { module: lintModule },
                capabilities: { modelNavigation, codeLink, definitionSearch, scripting },
                clipboard: { bridge },
                additionalModules: [CALLER_MODULE],
            },
        ],
    ];
}
