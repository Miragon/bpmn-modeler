import {
    changedSettingKeys,
    ColorThemeSetting,
    EditorSubscription,
    MarketplaceSettingsEntry,
    ModelerSettingsSnapshot,
    normalizeSettings,
    RawModelerSettings,
    SettingChange,
    settingChangeNaming,
    SettingKey,
    SettingsPort,
} from "@miragon/bpmn-modeler-core";
import { SurfaceMode } from "@miragon/bpmn-modeler-types";
import { HostSettingsMirror } from "../../port/HostSettingsMirror";

/**
 * Mutable {@link SettingsPort} fed by the host over RPC, plus the change-event
 * hub the core's settings subscriptions ride on.
 *
 * The VS Code host reads configuration synchronously and emits
 * `onDidChangeConfiguration`; out-of-process there is no such API, so the host
 * instead pushes whole snapshots. {@link apply} diffs the incoming snapshot
 * against the current one and fires a host-agnostic {@link SettingChange} naming
 * only the keys that actually changed — exactly the contract
 * `BpmnSettingsBroadcaster` and the templates reload branch expect, which is what
 * lets the unmodified core react identically on both hosts.
 */
export class BridgeSettings implements SettingsPort, HostSettingsMirror {
    // Render-safe before the host's first snapshot, which a host may leave out of register.
    private snapshot: ModelerSettingsSnapshot = normalizeSettings({});
    private readonly listeners = new Set<(event: SettingChange) => void>();

    /**
     * Merges the host's values into the snapshot, read as every host reads them,
     * and notifies listeners for each key whose read value changed. Listeners
     * are registered per open editor via {@link onDidChange}, so one host frame
     * fans out to every session — mirroring VS Code's global config event.
     */
    apply(raw: RawModelerSettings): void {
        const next = normalizeSettings({ ...this.snapshot, ...raw });
        const changed = changedSettingKeys(this.snapshot, next);
        this.snapshot = next;
        this.notify(changed);
    }

    /** Registers a settings-change listener; the returned subscription unregisters it. */
    onDidChange(listener: (event: SettingChange) => void): EditorSubscription {
        this.listeners.add(listener);
        return {
            dispose: () => {
                this.listeners.delete(listener);
            },
        };
    }

    getConfigFolder(): string {
        return this.snapshot.configFolder;
    }
    getPersistCodeLinkMap(): boolean {
        return this.snapshot.persistCodeLinkMap;
    }
    getAlignToOrigin(): boolean {
        return this.snapshot.alignToOrigin;
    }
    getShowTransactionBoundaries(): boolean {
        return this.snapshot.showTransactionBoundaries;
    }
    getC8ApiVersion(): string {
        return this.snapshot.c8ApiVersion;
    }
    getColorTheme(): ColorThemeSetting {
        return this.snapshot.colorTheme;
    }
    getDefaultMode(): SurfaceMode {
        return this.snapshot.defaultMode;
    }
    getFavouriteBpmnElements(): string[] {
        return this.snapshot.favouriteBpmnElements;
    }
    getLanguage(): string {
        return this.snapshot.language;
    }
    getLintingEnabled(): boolean {
        return this.snapshot.lintingEnabled;
    }
    /**
     * Whether to ship the Camunda SPIN globals (`S`/`JSON`) and the
     * `SpinJsonNode` member table to the host. The gate lives here in the bridge
     * (single source) so the thin Kotlin completion contributor needs no toggle
     * of its own — an off setting simply makes the `script/open` payload carry
     * empty `globals`/`types`.
     */
    getScriptingSpin(): boolean {
        return this.snapshot.scriptingSpin;
    }
    getMarketplaces(): MarketplaceSettingsEntry[] {
        return this.snapshot.marketplaces;
    }

    private notify(changed: readonly SettingKey[]): void {
        if (changed.length === 0) {
            return;
        }
        const event = settingChangeNaming(changed);
        // Copy before iterating: a listener may dispose itself on fire.
        for (const listener of [...this.listeners]) {
            listener(event);
        }
    }
}
