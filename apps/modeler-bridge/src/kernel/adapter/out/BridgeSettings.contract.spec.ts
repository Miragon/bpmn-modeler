import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_MODELER_SETTINGS, RawModelerSettings } from "@miragon/bpmn-modeler-core";
import { describeSettingsContract } from "@miragon/bpmn-modeler-core/testing";

import { hostNotification } from "../../../__fixtures__/bridgeHarness";
import { bindHandlers } from "../../../composition/bindHandlers";
import { bpmnEditorHandlers } from "../../../modeler/bpmn/adapter/in/bpmnEditorHandlers";
import { METHODS } from "../../../protocol/domain/descriptor";
import { SettingsDidChangeParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { BridgeSettings } from "./BridgeSettings";

/**
 * Pushes settings as IntelliJ's `EditorSessionRouter.pushSettings` does after
 * the user stores them: one `settings/didChange` carrying the whole snapshot of
 * `ModelerSettingsStore.snapshotMap`, a key the user left unset at its default,
 * and `marketplaces` as `ProjectMarketplacesStore.merged()` lists them. Values
 * pass through as stored, so the bridge's own reading meets every shape JSON
 * can carry; the Kotlin store's normalisation runs the shared rows in
 * `ModelerSettingsStoreTest`.
 */
class IntellijSettingsHost {
    readonly settings = new BridgeSettings();
    private readonly rpc = new Rpc(() => undefined);

    constructor() {
        bindHandlers(
            this.rpc,
            bpmnEditorHandlers({
                settingsMirror: this.settings,
                settings: this.settings,
                lintingPreference: { setLintingEnabled: async () => undefined },
                onSettingsApplied: () => undefined,
            }),
        );
    }

    async store(stored: RawModelerSettings, projectMarketplaces: readonly unknown[] = []) {
        const params: SettingsDidChangeParams = {
            settings: {
                ...DEFAULT_MODELER_SETTINGS,
                ...stored,
                marketplaces: mergedMarketplaces(stored.marketplaces, projectMarketplaces),
            },
        };
        await this.rpc.handleLine(hostNotification(METHODS.settingsDidChange, params));
    }
}

/**
 * The app-level list, then the project's own entries, each once. A value that
 * is no list passes through: IntelliJ's store holds lists, another host may not.
 */
function mergedMarketplaces(appLevel: unknown, projectLevel: readonly unknown[]): unknown {
    if (appLevel !== undefined && !Array.isArray(appLevel)) {
        return appLevel;
    }
    const seen = new Set<string>();
    return [...((appLevel as readonly unknown[] | undefined) ?? []), ...projectLevel].filter(
        (entry) => {
            // Kotlin's distinct() on the strings its store holds; JSON text also matches objects by their fields.
            const key = JSON.stringify(entry);
            const first = !seen.has(key);
            seen.add(key);
            return first;
        },
    );
}

describeSettingsContract(
    "BridgeSettings fed by a loopback IntelliJ host",
    async () => {
        const host = new IntellijSettingsHost();
        return {
            settings: host.settings,
            store: (stored, projectMarketplaces) => host.store(stored, projectMarketplaces),
        };
    },
    readFileSync(
        resolve(
            __dirname,
            "../../../../../../libs/modeler-core/src/kernel/domain/settingsNormalization.cases.json",
        ),
        "utf8",
    ),
);
