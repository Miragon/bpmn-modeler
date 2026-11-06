import { describe, expect, expectTypeOf, it } from "vitest";

import { createModeler } from "./createModeler";
import { DmnModeler } from "./modeler";
import type {
    CreateDmnModeler,
    DmnModelerHandle,
    DmnModelerOptions,
    DmnOperationResult,
    DmnThemeMode,
    DmnView,
    DmnViewChangedEvent,
} from "./publicApi";

const _classConformance = (modeler: DmnModeler): DmnModelerHandle => modeler;
void _classConformance;

const _factoryConformance: CreateDmnModeler = createModeler;
void _factoryConformance;

// DmnThemeMode aliases the private SurfaceThemeMode, so an edit there would change the published type.
expectTypeOf<DmnThemeMode>().toEqualTypeOf<"light" | "dark" | "automatic">();

async function _handleUsage(handle: DmnModelerHandle): Promise<void> {
    await handle.setLocale("de");
}
void _handleUsage;

const _allOptions = {
    propertiesPanel: { parent: document.createElement("aside") },
    additionalModules: {
        drd: [{ drd: true }],
        decisionTable: [{ table: true }],
        literalExpression: [{ literal: true }],
        boxedExpression: [{ boxed: true }],
    },
    moddleExtensions: { custom: { name: "custom" } },
    expressionLanguages: {
        options: [{ value: "custom", label: "Custom" }],
        defaults: { editor: "custom" },
    },
    dataTypes: ["custom"],
    keyboard: { bind: false },
    theme: "dark",
    locale: "de",
    onContentChanged: () => undefined,
    onViewChanged: ({ views, activeView }: DmnViewChangedEvent) => void [views, activeView],
    onWarning: (message: string) => void message,
} satisfies DmnModelerOptions;
void _allOptions;

const _view = {
    id: "Decision_1",
    name: "Decision",
    type: "decisionTable",
    element: { id: "Decision_1", name: "Decision", $type: "dmn:Decision" },
} satisfies DmnView;
void _view;

const _operationResult = {
    warnings: [{ message: "warning", error: { message: "detail", stack: "stack" } }],
} satisfies DmnOperationResult;
void _operationResult;

// @ts-expect-error propertiesPanel is required.
const _missingPanel: DmnModelerOptions = {
    keyboard: { bind: true },
};
void _missingPanel;

const _unkeyedModules = {
    propertiesPanel: { parent: document.createElement("aside") },
    // @ts-expect-error additional modules are grouped by view type.
    additionalModules: [{ __init__: [] }],
} satisfies DmnModelerOptions;
void _unkeyedModules;

const _invalidViewType = {
    id: "Decision_1",
    // @ts-expect-error only dmn-js view types are accepted.
    type: "table",
    element: { id: "Decision_1", $type: "dmn:Decision" },
} satisfies DmnView;
void _invalidViewType;

describe("DMN public API", () => {
    it("keeps its compile-time contract", () => {
        expect(true).toBe(true);
    });
});
