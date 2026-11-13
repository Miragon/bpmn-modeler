import { Command, Query } from "@miragon/bpmn-modeler-shared";

import { ProcessRestart } from "../../kernel/domain/approvableCodeTexts";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { trustOrTrusted } from "../../kernel/adapter/out/TrustedWorkspace";
import {
    LoggerPort,
    NotifierPort,
    SettingsPort,
    WorkspacePort,
    WorkspaceTrustPort,
} from "../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../kernel/port/templatePreferencePorts";
import { ContentRows } from "../../kernel/service/ContentRowMigration";
import { RouteLookup } from "../../editorSession/service/WebviewMessageRouter";
import { AddOnViewMessages } from "../adapter/in/AddOnViewMessages";
import type { AddOnCatalogModel } from "../domain/addOnCatalogModel";
import { CLOSED_VIEW } from "../domain/addOnRequests";
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
import { TemplateSwitchActions } from "../service/TemplateSwitchActions";

export interface AddOnsPanel {
    handle(command: Command): Promise<void>;
    setVisible(visible: boolean): void;
    dispose(): void;
}

export interface AddOnsHostPorts {
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly notifier: NotifierPort;
    /** The host's one approval list, which the plugins and the rule packages share. */
    readonly approvals: PluginApprovalStorePort;
    readonly settingChanges: SettingChanges;
    /** What the user does before code a revoked rule package ran is unloaded. */
    readonly restart: ProcessRestart;
    /** A revoke waits for the start-up rewrite of rows pinned to content and takes the ones located to it. */
    readonly contentRows: ContentRows;
    readonly plugins: PluginAddOnSource;
    /** Absent: the host runs no workspace rule package. */
    readonly rulePackages?: RulePackageAddOnSource;
    /** Absent: the host loads no element templates. */
    readonly templates?: TemplateAddOnSource;
    /** Absent: the host has no template marketplaces. */
    readonly marketplaces?: MarketplaceAddOnSource;
    /** Absent: the host keeps no template switches, and the catalog offers none. */
    readonly templatePreferences?: TemplatePreferenceStorePort;
    /** Absent: the host has no trust feature, and the workspace counts as trusted. */
    readonly workspaceTrust?: WorkspaceTrustPort;
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
    private readonly logger: LoggerPort;

    /** The routes of every panel, readable before one attaches. */
    readonly panelRoutes: RouteLookup;

    constructor(ports: AddOnsHostPorts) {
        this.logger = ports.notifier;
        // Every panel has the same table, so one that answers nothing reads for all.
        this.panelRoutes = new AddOnViewMessages(
            () => Promise.resolve(CLOSED_VIEW),
            ports.notifier,
            () => undefined,
        );
        const workspaceTrust = trustOrTrusted(ports.workspaceTrust);
        this.catalog = new AddOnCatalogService(
            new AddOnInventoryReader({ ...ports, workspaceTrust }),
            new TemplateSwitchActions(ports.templatePreferences, ports.notifier),
            {
                approvals: ports.approvals,
                plugins: ports.plugins,
                rulePackages: ports.rulePackages,
                marketplaces: ports.marketplaces,
                logger: ports.notifier,
                restart: ports.restart,
                contentRows: ports.contentRows,
            },
        );
        const invalidate = () => this.catalog.invalidate();
        this.hub = new AddOnViewHub(
            this.catalog,
            new AddOnWatchers(ports.workspace, ports.settings, invalidate),
            ports.workspace,
            ports.notifier,
        );
        this.subscriptions = [
            ports.approvals.onDidChange(invalidate),
            workspaceTrust.onDidChange(invalidate),
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

    /** Attaches a host's add-ons view page; `post` delivers to it, and a throw is logged. */
    attachPanel(post: (message: Query) => void, visible: boolean): AddOnsPanel {
        // Built before the hub attaches it, so a reveal delivered while attaching reaches it.
        const messages = new AddOnViewMessages(
            (request) => connection.handle(request),
            this.logger,
            post,
        );
        const connection = this.hub.attach(
            (model) => messages.modelBuilt(model),
            visible,
            (reveal) => messages.revealed(reveal),
        );
        return {
            handle: (command) => messages.handle(command),
            setVisible: (nowVisible) => {
                if (!nowVisible) messages.pageHidden();
                connection.setVisible(nowVisible);
            },
            dispose: () => {
                messages.dispose();
                connection.dispose();
            },
        };
    }

    /** Has every view show and focus these rows, once; one that is hidden or not attached yet when it is shown. */
    reveal(addOnIds: readonly string[]): void {
        this.hub.reveal({ kind: "rows", addOnIds });
    }

    /** Has every view show what needs review, once: Review Add-ons, after the host showed its view. */
    revealNeedsReview(): void {
        this.hub.reveal({ kind: "needsReview" });
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
