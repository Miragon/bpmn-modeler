import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

// The controllers import `vscode` for runtime objects used *inside* their
// methods, never at module load — so an empty mock lets us import their
// command-ID consts as the single source of truth. Same trick the service
// specs use (see BpmnModelerService.spec.ts).
vi.mock("vscode", () => ({}));

import {
    CHANGE_ENGINE_VERSION_CMD,
    CHANGE_LANGUAGE_CMD,
    COPY_SVG_CMD,
    LOGGING_CMD,
    MIGRATE_ALL_CMD,
    NEW_BPMN_MODEL_CMD,
    NEW_DMN_MODEL_CMD,
    NEW_FORM_MODEL_CMD,
    RELOAD_MODELER_CMD,
    FORMAT_DIAGRAM_CMD,
    CLEANUP_DIAGRAM_CMD,
    SAVE_SVG_CMD,
    TOGGLE_CMD,
    TOGGLE_LINTING_CMD,
} from "./modeler/bpmn/controller/CommandController";
import {
    COMPARE_SELECTED_CMD,
    COMPARE_WITH_SELECTED_CMD,
    SELECT_FOR_COMPARE_CMD,
} from "./diff/controller/BpmnCompareController";
import {
    DEPLOY_CMD,
    DEPLOY_FILES_CMD,
    DEPLOYMENT_STATUS_MENU_CMD,
    SWITCH_TARGET_CMD,
    VERIFY_DEPLOYMENT_CMD,
} from "./deployment/controller/DeploymentController";
import {
    ADD_MARKETPLACE_CMD,
    REMOVE_MARKETPLACE_CMD,
    UPDATE_MARKETPLACES_CMD,
} from "./templateMarketplace/controller/TemplateMarketplaceController";
import { OPEN_ALL_SCRIPT_TASKS_CMD } from "./scriptTask/controller/ScriptTaskCommandController";
import { FOCUS_LINT_ELEMENT_CMD } from "./modeler/bpmn/controller/FocusLintElementController";
import { OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD } from "./modeler/elementTemplate/controller/ElementTemplatePreviewController";
import { NEW_ELEMENT_TEMPLATE_CMD } from "./modeler/elementTemplate/controller/NewElementTemplateController";
import {
    FORM_INPUT_VALUES_SCHEME,
    FORM_OUTPUT_VALUES_SCHEME,
    TOGGLE_FORM_INPUT_VALUES_CMD,
    TOGGLE_FORM_OUTPUT_VALUES_CMD,
} from "./modeler/form/controller/FormValuesController";
import {
    BPMN_VIEW_TYPE,
    DEFAULT_MODELER_SETTINGS,
    DEFAULT_OPEN_TEMPLATE_PREVIEW,
    DMN_VIEW_TYPE,
    ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
    FORM_VIEW_TYPE,
    parseSetting,
    SettingKey,
} from "@miragon/bpmn-modeler-core";
import { InMemorySettings } from "@miragon/bpmn-modeler-core/testing";
import { supportedModelerLanguages } from "@miragon/bpmn-modeler-i18n-extras";
import { MODELER_SETTINGS_SECTION } from "./shared/infrastructure/modelerConfiguration";

const SRC_DIR = __dirname;

// The shipped manifest, parsed once. Drift between it and the code below is a
// runtime "command not found" / silent-`undefined`-setting bug invisible to the
// rest of the unit suite, which mocks `vscode` away entirely.
const manifest = JSON.parse(
    readFileSync(resolve(__dirname, "../package.json"), "utf-8"),
) as Manifest;

interface Manifest {
    activationEvents: string[];
    contributes: {
        commands: { command: string; title: string }[];
        keybindings: { command: string }[];
        menus: Record<string, { command: string }[]>;
        customEditors: {
            viewType: string;
            priority: string | { textEditor: string; diffEditor?: string };
            selector: { filenamePattern: string }[];
        }[];
        configurationDefaults: Record<string, Record<string, string>>;
        jsonValidation: { fileMatch: string; url: string }[];
        configuration: {
            properties: Record<
                string,
                { default?: unknown; enum?: string[]; enumItemLabels?: string[]; maxItems?: number }
            >;
        };
    };
}

/** All command IDs the code actually registers, sourced from the controllers. */
const CODE_COMMAND_IDS = [
    TOGGLE_CMD,
    LOGGING_CMD,
    COPY_SVG_CMD,
    SAVE_SVG_CMD,
    OPEN_ALL_SCRIPT_TASKS_CMD,
    CHANGE_ENGINE_VERSION_CMD,
    MIGRATE_ALL_CMD,
    CHANGE_LANGUAGE_CMD,
    TOGGLE_LINTING_CMD,
    NEW_BPMN_MODEL_CMD,
    NEW_DMN_MODEL_CMD,
    NEW_FORM_MODEL_CMD,
    RELOAD_MODELER_CMD,
    FORMAT_DIAGRAM_CMD,
    CLEANUP_DIAGRAM_CMD,
    SELECT_FOR_COMPARE_CMD,
    COMPARE_WITH_SELECTED_CMD,
    COMPARE_SELECTED_CMD,
    DEPLOY_CMD,
    SWITCH_TARGET_CMD,
    DEPLOY_FILES_CMD,
    VERIFY_DEPLOYMENT_CMD,
    DEPLOYMENT_STATUS_MENU_CMD,
    ADD_MARKETPLACE_CMD,
    UPDATE_MARKETPLACES_CMD,
    REMOVE_MARKETPLACE_CMD,
    FOCUS_LINT_ELEMENT_CMD,
    TOGGLE_FORM_INPUT_VALUES_CMD,
    TOGGLE_FORM_OUTPUT_VALUES_CMD,
    OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD,
    NEW_ELEMENT_TEMPLATE_CMD,
];

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
    it("activates to clean up restored form values documents", () => {
        expect(manifest.activationEvents).toEqual(
            expect.arrayContaining([
                `onFileSystem:${FORM_INPUT_VALUES_SCHEME}`,
                `onFileSystem:${FORM_OUTPUT_VALUES_SCHEME}`,
            ]),
        );
    });

    // The preview opens on its own only once the extension runs.
    it("activates where element templates live", () => {
        expect(manifest.activationEvents).toContain(
            "workspaceContains:**/element-templates/**/*.json",
        );
    });

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

        expect(new Set(declared)).toEqual(
            new Set([
                BPMN_VIEW_TYPE,
                DMN_VIEW_TYPE,
                FORM_VIEW_TYPE,
                ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
            ]),
        );
    });

    it("offers the template preview for JSON files without taking them over", () => {
        expect(manifest.contributes.customEditors).toContainEqual(
            expect.objectContaining({
                viewType: ELEMENT_TEMPLATE_PREVIEW_VIEW_TYPE,
                priority: "option",
                selector: [{ filenamePattern: "*.json" }],
            }),
        );
        expect(manifest.contributes.menus["editor/title"]).toContainEqual(
            expect.objectContaining({ command: OPEN_ELEMENT_TEMPLATE_PREVIEW_CMD }),
        );
    });

    it("associates forms with JSON validation and the visual editor", () => {
        expect(manifest.contributes.customEditors).toContainEqual(
            expect.objectContaining({
                viewType: FORM_VIEW_TYPE,
                priority: "default",
                selector: [{ filenamePattern: "*.form" }],
            }),
        );
        expect(manifest.contributes.configurationDefaults["files.associations"]["*.form"]).toBe(
            "json",
        );
        expect(
            manifest.contributes.configurationDefaults["workbench.editorAssociations"]["*.form"],
        ).toBe(FORM_VIEW_TYPE);
        expect(manifest.contributes.jsonValidation).toContainEqual({
            fileMatch: "**/*.form",
            url: "./schemas/form.schema.json",
        });
    });

    it("opts the BPMN editor into diffs explicitly", () => {
        // Since VS Code 1.129 a custom editor is excluded from `vscode.diff`
        // unless `priority.diffEditor` opts in; the string form silently drops
        // the BPMN diff view back to the text diff.
        const bpmn = manifest.contributes.customEditors.find((e) => e.viewType === BPMN_VIEW_TYPE);

        expect(bpmn?.priority).toEqual({ textEditor: "default", diffEditor: "default" });
    });

    const declaredKeys = Object.keys(manifest.contributes.configuration.properties)
        .filter((key) => key.startsWith(`${MODELER_SETTINGS_SECTION}.`))
        .map((key) => key.slice(MODELER_SETTINGS_SECTION.length + 1));

    it("reads, writes and watches every VS Code setting only in modelerConfiguration.ts", () => {
        // Its keys are typed `SettingKey`, so the manifest row below covers every key asked.
        const modelerConfigurationFile = resolve(
            SRC_DIR,
            "shared/infrastructure/modelerConfiguration.ts",
        );
        const offenders = productionSourceFiles(SRC_DIR).filter(
            (file) =>
                file !== modelerConfigurationFile &&
                /\b(?:getConfiguration|affectsConfiguration|onDidChangeConfiguration)\(/.test(
                    readFileSync(file, "utf-8"),
                ),
        );

        expect(offenders).toEqual([]);
    });

    it("names settings by exactly the keys the manifest declares", () => {
        // A `Record` literal makes the compiler hold this list to the SettingKey union.
        const settingKeys: Record<SettingKey, true> = {
            "alignToOrigin": true,
            "showTransactionBoundaries": true,
            "configFolder": true,
            "persistCodeLinkMap": true,
            "c8ApiVersion": true,
            "colorTheme": true,
            "defaultMode": true,
            "favouriteBpmnElements": true,
            "language": true,
            "scripting.spin": true,
            "marketplaces": true,
            "linting.enabled": true,
            "elementTemplatePreview.openAutomatically": true,
        };

        expect(new Set(Object.keys(settingKeys))).toEqual(new Set(declaredKeys));
    });

    it("gives the core and its in-memory settings the defaults the manifest declares", () => {
        // `scripting.spin` → `scriptingSpin`
        const settingsValueName = (key: string) =>
            key
                .slice(MODELER_SETTINGS_SECTION.length + 1)
                .replace(/\.(\w)/g, (_, initial: string) => initial.toUpperCase());
        const manifestDefaults = Object.fromEntries(
            Object.entries(manifest.contributes.configuration.properties)
                .filter(([key]) => key.startsWith(`${MODELER_SETTINGS_SECTION}.`))
                .map(([key, property]) => [settingsValueName(key), property.default]),
        );

        // Only VS Code reads it, so it stays outside the core's snapshot.
        const { elementTemplatePreviewOpenAutomatically, ...snapshotDefaults } = manifestDefaults;

        expect(elementTemplatePreviewOpenAutomatically).toBe(DEFAULT_OPEN_TEMPLATE_PREVIEW);
        expect(DEFAULT_MODELER_SETTINGS).toEqual(snapshotDefaults);
        expect(new InMemorySettings().values).toEqual(snapshotDefaults);
    });

    it.each(
        (["colorTheme", "defaultMode"] as const).flatMap((key) =>
            (
                manifest.contributes.configuration.properties[`${MODELER_SETTINGS_SECTION}.${key}`]
                    .enum ?? []
            ).map((value) => ({ key, value })),
        ),
    )("reads the $key $value the manifest offers as itself", ({ key, value }) => {
        expect(parseSetting(key, value)).toBe(value);
    });

    it("offers every language the modeler ships, labelled as the language picker labels it", () => {
        const { enum: locales = [], enumItemLabels: labels = [] } =
            manifest.contributes.configuration.properties[`${MODELER_SETTINGS_SECTION}.language`];
        const byLocale = (a: { locale: string }, b: { locale: string }) =>
            a.locale.localeCompare(b.locale);
        const offered = locales.map((locale, index) => ({ locale, label: labels[index] }));
        const shipped = supportedModelerLanguages.map(({ locale, label }) => ({ locale, label }));

        expect(labels).toHaveLength(locales.length);
        expect(offered.sort(byLocale)).toEqual(shipped.sort(byLocale));
    });

    it("documents every language the modeler ships", () => {
        const languageSupportPage = readFileSync(
            resolve(__dirname, "../../../docs/vscode/features/language-support.md"),
            "utf-8",
        );
        const documented = [...languageSupportPage.matchAll(/^\| `([^`]+)` \|/gm)].map(
            ([, locale]) => locale,
        );

        expect(documented.sort()).toEqual(
            supportedModelerLanguages.map(({ locale }) => locale).sort(),
        );
    });

    it("pins as many favourite elements as the manifest allows", () => {
        const maxItems =
            manifest.contributes.configuration.properties[
                `${MODELER_SETTINGS_SECTION}.favouriteBpmnElements`
            ].maxItems ?? 0;
        const oneTooMany = Array.from({ length: maxItems + 1 }, (_, index) => `bpmn:Task${index}`);

        expect(maxItems).toBeGreaterThan(0);
        expect(parseSetting("favouriteBpmnElements", oneTooMany)).toHaveLength(maxItems);
    });

    it("never uses the legacy miragon.camundaModeler prefix anywhere in src", () => {
        const offenders = productionSourceFiles(SRC_DIR).filter((file) =>
            readFileSync(file, "utf-8").includes(LEGACY_NAMESPACE),
        );

        expect(offenders).toEqual([]);
    });

    // Context menus render only `title`, not `category` — a title identical to a
    // VS Code built-in in the same menu group is visually indistinguishable.
    it("never shadows a built-in VS Code title in a shared context menu", () => {
        const VSCODE_BUILTIN_MENU_TITLES = new Set(
            [
                "Select for Compare",
                "Compare with Selected",
                "Compare Selected",
                "Open to the Side",
                "Open With...",
                "Open Timeline",
                "Copy Path",
                "Copy Relative Path",
                "Rename...",
                "Delete",
                "Cut",
                "Copy",
                "Paste",
                "Find in Folder...",
                "Reveal in Finder",
                "Reveal in File Explorer",
                "Open in Integrated Terminal",
            ].map((t) => t.toLowerCase().trim()),
        );

        const SHARED_MENUS = ["explorer/context", "editor/title", "editor/title/context"];

        const commandsInSharedMenus = new Set(
            SHARED_MENUS.flatMap(
                (menu) => manifest.contributes.menus[menu]?.map((e) => e.command) ?? [],
            ),
        );

        const titleByCommand = new Map(
            manifest.contributes.commands.map((c) => [c.command, c.title]),
        );

        const collisions = [...commandsInSharedMenus]
            .map((cmd) => ({ cmd, title: titleByCommand.get(cmd) }))
            .filter(
                ({ title }) => title && VSCODE_BUILTIN_MENU_TITLES.has(title.toLowerCase().trim()),
            );

        expect(collisions).toEqual([]);
    });

    it("actually sets every custom when-clause context key it gates UI on", () => {
        // Non-builtin keys referenced in `when` clauses; a menu/keybinding gated
        // on a key nothing ever sets is silently dead.
        const contextKeys = [
            "bpmn-modeler.openCustomEditors",
            "bpmn-modeler.compareSelectionActive",
            "bpmn-modeler.isElementTemplate",
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
