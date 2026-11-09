import { ProcessRestart } from "../../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { NotifierPort, SettingsPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../kernel/port/templatePreferencePorts";
import type { AddOnCatalogModel } from "../domain/addOnCatalogModel";
import {
    MarketplaceAddOnSource,
    PluginAddOnSource,
    RulePackageAddOnSource,
    SettingChanges,
    TemplateAddOnSource,
} from "../port/addOnSourcePorts";
import { AddOnCatalogService } from "../service/AddOnCatalogService";
import { AddOnInventoryReader } from "../service/AddOnInventoryReader";
import { AddOnViewConnection, AddOnViewHub } from "../service/AddOnViewHub";
import { AddOnWatchers } from "../service/AddOnWatchers";

export interface AddOnsHostPorts {
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly notifier: NotifierPort;
    /** The host's one approval list, which the plugins and the rule packages share. */
    readonly approvals: PluginApprovalStorePort;
    readonly settingChanges: SettingChanges;
    /** What the user does before code a revoked rule package ran is unloaded. */
    readonly restart: ProcessRestart;
    readonly plugins: PluginAddOnSource;
    /** Absent: the host runs no workspace rule package. */
    readonly rulePackages?: RulePackageAddOnSource;
    /** Absent: the host loads no element templates. */
    readonly templates?: TemplateAddOnSource;
    /** Absent: the host has no template marketplaces. */
    readonly marketplaces?: MarketplaceAddOnSource;
    /** Absent: the host keeps no template switches, and the catalog offers none. */
    readonly templatePreferences?: TemplatePreferenceStorePort;
}

/**
 * The add-ons of the open workspace for a host's view: what each owner finds,
 * its state and what the user may do about it. A host attaches each view it
 * shows; the catalog builds only while one is visible.
 */
export class AddOnsFeature {
    private readonly catalog: AddOnCatalogService;
    private readonly hub: AddOnViewHub;
    private readonly subscriptions: { dispose(): void }[];

    constructor(ports: AddOnsHostPorts) {
        this.catalog = new AddOnCatalogService(new AddOnInventoryReader(ports), {
            approvals: ports.approvals,
            plugins: ports.plugins,
            rulePackages: ports.rulePackages,
            marketplaces: ports.marketplaces,
            templatePreferences: ports.templatePreferences,
            logger: ports.notifier,
            restart: ports.restart,
        });
        const invalidate = () => this.catalog.invalidate();
        this.hub = new AddOnViewHub(
            this.catalog,
            new AddOnWatchers(ports.workspace, ports.settings, invalidate),
            ports.workspace,
            ports.notifier,
        );
        this.subscriptions = [
            ports.approvals.onDidChange(invalidate),
            ports.plugins.onDidChange(invalidate),
            ...[
                ports.rulePackages,
                ports.templates,
                ports.marketplaces,
                ports.templatePreferences,
            ].flatMap((source) => (source === undefined ? [] : [source.onDidChange(invalidate)])),
            ports.settingChanges.onDidChange((change) => {
                if (change.affects("configFolder") || change.affects("marketplaces")) {
                    this.hub.refresh();
                }
            }),
        ];
    }

    /** @param post Called with every model while the view is visible; a throw is logged. */
    attachView(post: (model: AddOnCatalogModel) => void, visible: boolean): AddOnViewConnection {
        return this.hub.attach(post, visible);
    }

    /** Reads everything again, installed packages and stored approvals included. */
    refresh(): void {
        this.hub.refresh();
    }

    whenSettled(): Promise<void> {
        return this.catalog.whenSettled();
    }

    dispose(): void {
        this.subscriptions.forEach((each) => each.dispose());
        this.hub.dispose();
    }
}
