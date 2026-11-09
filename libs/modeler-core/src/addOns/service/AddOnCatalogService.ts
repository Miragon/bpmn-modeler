import {
    ListedPresence,
    ProcessRestart,
    reviewedAllowDecision,
    revoking,
} from "../../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../kernel/port/templatePreferencePorts";
import { catalogModelOf, ShownCode } from "../domain/addOnCatalog";
import type { AddOnCatalogModel } from "../domain/addOnCatalogModel";
import { CatalogActionKind, CodeAddOnKind } from "../domain/addOnIds";
import {
    AddOnActionResult,
    AddOnRequest,
    CATALOG_NOT_OFFERED,
    catalogActionRefusalOf,
    REPORTED_BY_FLOW,
} from "../domain/addOnRequests";
import {
    allowResultOf,
    allowTargetOf,
    inspectResultOf,
    PRUNE_FAILED,
    pruneResultOf,
    revokeResultOf,
    shownTargetOf,
} from "../domain/codeAddOnRequests";
import { firstRevisionOf, ShownRevisions } from "../domain/shownRevisions";
import {
    marketplaceRemovalTargetOf,
    sourceSwitchTargetOf,
    TEMPLATE_SWITCH_FAILED,
    templateSwitchTargetOf,
    TemplateSwitchTarget,
} from "../domain/templateAddOnRequests";
import { ShownSource, ShownTemplate } from "../domain/templateAddOnViews";
import {
    CodeAddOnSource,
    MarketplaceAddOnSource,
    PluginAddOnSource,
    RulePackageAddOnSource,
} from "../port/addOnSourcePorts";
import { AddOnInventoryReader } from "./AddOnInventoryReader";

export interface AddOnCatalogPorts {
    readonly approvals: PluginApprovalStorePort;
    readonly plugins: PluginAddOnSource;
    readonly rulePackages?: RulePackageAddOnSource;
    readonly marketplaces?: MarketplaceAddOnSource;
    /** Absent: the host keeps no template switches, and the catalog offers none. */
    readonly templatePreferences?: TemplatePreferenceStorePort;
    readonly logger: LoggerPort;
    readonly restart: ProcessRestart;
}

type QueuedRequest = Extract<
    AddOnRequest,
    {
        kind:
            | "inspect"
            | "allow"
            | "revoke"
            | "pruneCache"
            | "enable"
            | "disable"
            | "enableTemplates"
            | "disableTemplates";
    }
>;
type MarketplaceRequest = Extract<
    AddOnRequest,
    { kind: "addMarketplace" | "updateMarketplaces" | "removeMarketplace" }
>;

/**
 * Builds the model one listing at a time, and once more if anything changed
 * meanwhile, and acts on what a view asks. Its code actions run one at a time
 * on a queue of their own: a notice left open must not hold back the view. A
 * reload or a relint follows the approval change event, as it does for a
 * notice's answer. A marketplace action goes to the marketplace flows, which
 * queue, ask and report on their own, and the listing follows their change
 * event.
 */
export class AddOnCatalogService {
    private revision = firstRevisionOf(Date.now());
    private revisions = ShownRevisions.empty();
    private readonly inspected = new Set<string>();
    private latestModel?: AddOnCatalogModel;
    private latestSources: ReadonlyMap<string, ShownSource> = new Map();
    private latestTemplates: ReadonlyMap<string, ShownTemplate> = new Map();
    private latestCatalogActions: readonly CatalogActionKind[] = [];
    private active = false;
    private building?: Promise<void>;
    private dirty = false;
    private actions: Promise<unknown> = Promise.resolve();
    private work: Promise<unknown> = Promise.resolve();
    private readonly builtListeners = new Set<(model: AddOnCatalogModel) => void>();

    constructor(
        private readonly reader: AddOnInventoryReader,
        private readonly ports: AddOnCatalogPorts,
    ) {}

    onDidBuild(listener: (model: AddOnCatalogModel) => void): { dispose(): void } {
        this.builtListeners.add(listener);
        return { dispose: () => this.builtListeners.delete(listener) };
    }

    latest(): AddOnCatalogModel | undefined {
        return this.latestModel;
    }

    /** Builds only while a view shows the model; a view shown again asks for a build. */
    setActive(active: boolean): void {
        this.active = active;
    }

    invalidate(): void {
        if (!this.active) {
            return;
        }
        if (this.building !== undefined) {
            this.dirty = true;
            return;
        }
        this.building = this.buildUntilCurrent();
        this.track(this.building);
    }

    /** Resolves once no build and no action is left, those they started included. */
    async whenSettled(): Promise<void> {
        let settling: Promise<unknown>;
        do {
            settling = this.work;
            await settling;
        } while (settling !== this.work);
    }

    handle(request: AddOnRequest): Promise<AddOnActionResult> {
        switch (request.kind) {
            case "refresh":
                this.invalidate();
                return Promise.resolve({ kind: "done" });
            case "addMarketplace":
            case "updateMarketplaces":
            case "removeMarketplace": {
                const flow = this.runMarketplaceFlow(request);
                this.track(flow);
                return flow;
            }
            default: {
                const acting = this.actions.catch(() => undefined).then(() => this.act(request));
                this.actions = acting;
                this.track(acting);
                return acting;
            }
        }
    }

    private async runMarketplaceFlow(request: MarketplaceRequest): Promise<AddOnActionResult> {
        const { marketplaces } = this.ports;
        if (marketplaces === undefined) return CATALOG_NOT_OFFERED;
        if (request.kind === "removeMarketplace") {
            const target = marketplaceRemovalTargetOf(this.latestSources, request.sourceId);
            if (target.kind === "refused") return target.result;
            await marketplaces.remove(target.entry);
            return REPORTED_BY_FLOW;
        }
        const refusal = catalogActionRefusalOf(this.latestCatalogActions, request.kind);
        if (refusal !== undefined) return refusal;
        await (request.kind === "addMarketplace" ? marketplaces.add() : marketplaces.update());
        return REPORTED_BY_FLOW;
    }

    private async act(request: QueuedRequest): Promise<AddOnActionResult> {
        try {
            return await this.actOn(request);
        } finally {
            this.invalidate();
        }
    }

    private actOn(request: QueuedRequest): Promise<AddOnActionResult> {
        switch (request.kind) {
            case "inspect":
                return Promise.resolve(this.inspect(request.addOnId));
            case "allow":
                return this.allow(request.addOnId, request.revision);
            case "revoke":
                return this.revoke(request.addOnId);
            case "pruneCache":
                return this.prune();
            case "enable":
            case "disable":
                return this.switchTemplates(
                    templateSwitchTargetOf(this.latestTemplates, request.addOnId, request.kind),
                );
            case "enableTemplates":
            case "disableTemplates":
                return this.switchTemplates(
                    sourceSwitchTargetOf(this.latestSources, request.sourceId, request.kind),
                );
        }
    }

    private async switchTemplates(target: TemplateSwitchTarget): Promise<AddOnActionResult> {
        if (target.kind === "refused") return target.result;
        const store = this.ports.templatePreferences;
        if (store === undefined) return CATALOG_NOT_OFFERED;
        try {
            await store.change(target.change);
        } catch (error) {
            this.logError(error);
            return TEMPLATE_SWITCH_FAILED;
        }
        return target.result;
    }

    private inspect(addOnId: string): AddOnActionResult {
        const target = shownTargetOf(this.revisions, addOnId, "inspect");
        if (target.kind === "refused") return target.result;
        this.inspected.add(target.code.id);
        return inspectResultOf(target.code);
    }

    private async allow(addOnId: string, revision: number): Promise<AddOnActionResult> {
        const target = allowTargetOf(this.revisions, revision, addOnId);
        if (target.kind === "refused") return target.result;
        const decision = reviewedAllowDecision(target.content, await this.currentOf(target.code));
        if (decision.kind === "allow") {
            await this.ports.approvals.change(decision.change);
        }
        return allowResultOf(target.code, decision);
    }

    private async revoke(addOnId: string): Promise<AddOnActionResult> {
        const target = shownTargetOf(this.revisions, addOnId, "revoke");
        if (target.kind === "refused") return target.result;
        const { code } = target;
        // Before the change, whose reload or relint could ask about it at once.
        code.leftForViewByRevoke.forEach((each) => this.sourceOf(code.kind)?.leaveForView(each));
        await this.ports.approvals.change(revoking([code.id]));
        await this.sourceOf(code.kind)?.afterRevoke();
        return revokeResultOf(code);
    }

    private async prune(): Promise<AddOnActionResult> {
        try {
            const { removed } = await this.ports.plugins.pruneCache();
            return pruneResultOf(removed);
        } catch (error) {
            this.logError(error);
            return PRUNE_FAILED;
        }
    }

    private async currentOf({ kind, id, name }: ShownCode): Promise<ListedPresence> {
        return (await this.sourceOf(kind)?.current(id)) ?? { kind: "gone", id, name };
    }

    private sourceOf(kind: CodeAddOnKind): CodeAddOnSource | undefined {
        return { plugin: this.ports.plugins, rulePackage: this.ports.rulePackages }[kind];
    }

    private async buildUntilCurrent(): Promise<void> {
        do {
            this.dirty = false;
            try {
                await this.build();
            } catch (error) {
                this.logError(error);
            }
        } while (this.dirty && this.active);
        // In the tick of the last check, so no invalidate lands between it and the reset.
        this.building = undefined;
    }

    private async build(): Promise<void> {
        const { plugins, rulePackages, restart } = this.ports;
        const facts = await this.reader.read(this.inspected);
        const revision = ++this.revision;
        const { model, shown, sources, templates, catalogActions } = catalogModelOf(
            facts,
            {
                answers: {
                    plugin: plugins.sessionAnswers(),
                    rulePackage: rulePackages?.sessionAnswers() ?? new Map(),
                },
                stillLoaded: {
                    plugin: plugins.stillLoadedAfterRevoke(),
                    rulePackage: rulePackages?.stillLoadedAfterRevoke() ?? new Set(),
                },
            },
            restart,
            revision,
        );
        this.revisions = this.revisions.recorded(revision, shown);
        this.latestSources = sources;
        this.latestTemplates = templates;
        this.latestCatalogActions = catalogActions;
        this.latestModel = model;
        this.builtListeners.forEach((listener) => listener(model));
    }

    private logError(error: unknown): void {
        this.ports.logger.logError(error instanceof Error ? error : new Error(String(error)));
    }

    private track(work: Promise<unknown>): void {
        this.work = Promise.all([this.work, work.catch(() => undefined)]);
    }
}
