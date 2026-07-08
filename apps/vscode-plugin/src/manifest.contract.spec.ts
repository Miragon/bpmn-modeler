import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The controllers import `vscode` for runtime objects used *inside* their
// methods, never at module load — so an empty mock lets us import their
// command-ID consts as the single source of truth. Same trick the service
// specs use (see BpmnModelerService.spec.ts).
vi.mock("vscode", () => ({}));
// CommandController imports the real i18n entry, which declares no
// `main`/`exports` and so cannot resolve under vitest; a stub keeps the
// module-load import satisfied without affecting these manifest assertions.
vi.mock("@miragon/bpmn-modeler-i18n", () => ({ supportedLanguages: [] }));

import {
    CHANGE_ENGINE_VERSION_CMD,
    CHANGE_LANGUAGE_CMD,
    COPY_SVG_CMD,
    LOGGING_CMD,
    MIGRATE_ALL_CMD,
    NEW_BPMN_MODEL_CMD,
    NEW_DMN_MODEL_CMD,
    SAVE_SVG_CMD,
    TOGGLE_CMD,
} from "./modeler/bpmn/controller/CommandController";
import {
    COMPARE_SELECTED_CMD,
    COMPARE_WITH_SELECTED_CMD,
    SELECT_FOR_COMPARE_CMD,
} from "./diff/controller/BpmnCompareController";
import { DEPLOY_CMD } from "./deployment/controller/DeploymentController";
import {
    ADD_MARKETPLACE_CMD,
    REMOVE_MARKETPLACE_CMD,
    UPDATE_MARKETPLACES_CMD,
} from "./templateMarketplace/controller/TemplateMarketplaceController";
import { BPMN_VIEW_TYPE, DMN_VIEW_TYPE } from "@miragon/bpmn-modeler-core";

const SRC_DIR = __dirname;

// The shipped manifest, parsed once. Drift between it and the code below is a
// runtime "command not found" / silent-`undefined`-setting bug invisible to the
// rest of the unit suite, which mocks `vscode` away entirely.
const manifest = JSON.parse(
    readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
) as Manifest;

interface Manifest {
    contributes: {
        commands: { command: string }[];
        keybindings: { command: string }[];
        menus: Record<string, { command: string }[]>;
        customEditors: { viewType: string }[];
        configuration: { properties: Record<string, unknown> };
    };
}

/** All command IDs the code actually registers, sourced from the controllers. */
const CODE_COMMAND_IDS = [
    TOGGLE_CMD,
    LOGGING_CMD,
    COPY_SVG_CMD,
    SAVE_SVG_CMD,
    CHANGE_ENGINE_VERSION_CMD,
    MIGRATE_ALL_CMD,
    CHANGE_LANGUAGE_CMD,
    NEW_BPMN_MODEL_CMD,
    NEW_DMN_MODEL_CMD,
    SELECT_FOR_COMPARE_CMD,
    COMPARE_WITH_SELECTED_CMD,
    COMPARE_SELECTED_CMD,
    DEPLOY_CMD,
    ADD_MARKETPLACE_CMD,
    UPDATE_MARKETPLACES_CMD,
    REMOVE_MARKETPLACE_CMD,
];

const CONFIG_NAMESPACE = "miragon.bpmnModeler";
const LEGACY_NAMESPACE = ["miragon", "camundaModeler"].join("."); // built so this file is not its own false positive

/** Recursively collects production `.ts` files under `src` (excludes specs). */
function productionSourceFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) {
            return productionSourceFiles(full);
        }
        const isTs = entry.name.endsWith(".ts");
        const isTest = entry.name.endsWith(".spec.ts") || entry.name.endsWith(".test.ts");
        return isTs && !isTest ? [full] : [];
    });
}

describe("package.json ↔ code contract", () => {
    it("declares exactly the commands the controllers register", () => {
        const declared = manifest.contributes.commands.map((c) => c.command);

        expect(new Set(declared)).toEqual(new Set(CODE_COMMAND_IDS));
    });

    it("references only declared commands from menus and keybindings", () => {
        const declared = new Set(manifest.contributes.commands.map((c) => c.command));

        const referenced = [
            ...manifest.contributes.keybindings.map((k) => k.command),
            ...Object.values(manifest.contributes.menus).flatMap((entries) =>
                entries.map((e) => e.command),
            ),
        ];

        const undeclared = referenced.filter((command) => !declared.has(command));
        expect(undeclared).toEqual([]);
    });

    it("declares exactly the custom-editor viewTypes the code uses", () => {
        const declared = manifest.contributes.customEditors.map((e) => e.viewType);

        expect(new Set(declared)).toEqual(new Set([BPMN_VIEW_TYPE, DMN_VIEW_TYPE]));
    });

    it("keeps config keys in sync between manifest and VsCodeSettings", () => {
        const declaredKeys = Object.keys(manifest.contributes.configuration.properties)
            .filter((key) => key.startsWith(`${CONFIG_NAMESPACE}.`))
            .map((key) => key.slice(CONFIG_NAMESPACE.length + 1));

        // This check assumes all config access is centralized in
        // `VsCodeSettings.ts` with string-literal keys — a key read elsewhere, or
        // built from a computed expression, would silently drift past this regex.
        // All keys read in the one class that owns config access. The `<T>`
        // generic is always present on these calls but kept optional for safety.
        const settingsSource = readFileSync(
            resolve(SRC_DIR, "shared/infrastructure/VsCodeSettings.ts"),
            "utf-8",
        );
        const readKeys = [
            ...settingsSource.matchAll(/\.(?:get|update)(?:<[^>]*>)?\(\s*["']([^"']+)["']/g),
        ].map((match) => match[1]);

        expect(new Set(readKeys)).toEqual(new Set(declaredKeys));
    });

    it("never uses the legacy miragon.camundaModeler prefix anywhere in src", () => {
        const offenders = productionSourceFiles(SRC_DIR).filter((file) =>
            readFileSync(file, "utf-8").includes(LEGACY_NAMESPACE),
        );

        expect(offenders).toEqual([]);
    });

    it("actually sets every custom when-clause context key it gates UI on", () => {
        // Non-builtin keys referenced in `when` clauses; a menu/keybinding gated
        // on a key nothing ever sets is silently dead.
        const contextKeys = [
            "bpmn-modeler.openCustomEditors",
            "bpmn-modeler.compareSelectionActive",
        ];

        const sources = productionSourceFiles(SRC_DIR).map((file) => readFileSync(file, "utf-8"));

        for (const key of contextKeys) {
            // The key may be referenced via a local const, so we only require it
            // to co-occur with a `setContext` call in the same file.
            const isSet = sources.some(
                (source) => source.includes("setContext") && source.includes(key),
            );
            expect(isSet, `no setContext call found for "${key}"`).toBe(true);
        }
    });
});
