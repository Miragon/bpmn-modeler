import {
    ListedPresence,
    ProcessRestart,
    reviewedAllowDecision,
    revoking,
} from "../../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { LoggerPort } from "../../kernel/port/hostPorts";
import { AddOnCatalogModel, catalogModelOf, ShownCode } from "../domain/addOnCatalog";
import { AddOnKind } from "../domain/addOnIds";
import {
    AddOnActionResult,
    AddOnRequest,
    allowResultOf,
    allowTargetOf,
    inspectResultOf,
    pruneResultOf,
    revokeResultOf,
    shownTargetOf,
} from "../domain/addOnRequests";
import { ShownRevisions } from "../domain/shownRevisions";
import {
    CodeAddOnSource,
    PluginAddOnSource,
    RulePackageAddOnSource,
} from "../port/addOnSourcePorts";
import { AddOnInventoryReader } from "./AddOnInventoryReader";

export interface AddOnCatalogPorts {
    readonly approvals: PluginApprovalStorePort;
    readonly plugins: PluginAddOnSource;
    readonly rulePackages?: RulePackageAddOnSource;
    readonly logger: LoggerPort;
    readonly restart: ProcessRestart;
}

/**
 * Builds the model one listing at a time, and once more if anything changed
 * meanwhile, and acts on what a view asks. Its actions run one at a time on a
 * queue of their own: a notice left open must not hold back the view. A
 * reload or a relint follows the approval change event, as it does for a
 * notice's answer.
 */
export class AddOnCatalogService {
    private revision = 0;
    private revisions = ShownRevisions.empty();
    private readonly inspected = new Set<string>();
    private latestModel?: AddOnCatalogModel;
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
        if (request.kind === "refresh") {
            this.invalidate();
            return Promise.resolve({ kind: "done" });
        }
        const acting = this.actions.catch(() => undefined).then(() => this.act(request));
        this.actions = acting;
        this.track(acting);
        return acting;
    }

    private async act(
        request: Exclude<AddOnRequest, { kind: "refresh" }>,
    ): Promise<AddOnActionResult> {
        try {
            return await this.actOn(request);
        } finally {
            this.invalidate();
        }
    }

    private actOn(request: Exclude<AddOnRequest, { kind: "refresh" }>): Promise<AddOnActionResult> {
        switch (request.kind) {
            case "inspect":
                return Promise.resolve(this.inspect(request.addOnId));
            case "allow":
                return this.allow(request.addOnId, request.revision);
            case "revoke":
                return this.revoke(request.addOnId);
            case "pruneCache":
                return this.prune();
        }
    }

    private inspect(addOnId: string): AddOnActionResult {
        const target = shownTargetOf(this.revisions, addOnId);
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
        const target = shownTargetOf(this.revisions, addOnId);
        if (target.kind === "refused") return target.result;
        const { code } = target;
        // Before the change, whose reload or relint could ask about it at once.
        if (code.content !== undefined) this.sourceOf(code.kind)?.leaveForView(code.content);
        await this.ports.approvals.change(revoking([code.id]));
        if (code.kind === "plugin") await this.ports.plugins.pruneCache();
        return revokeResultOf(code, this.ports.restart);
    }

    private async prune(): Promise<AddOnActionResult> {
        const { removed } = await this.ports.plugins.pruneCache();
        return pruneResultOf(removed);
    }

    private currentOf({ kind, id, name }: ShownCode): Promise<ListedPresence> {
        const { plugins, rulePackages } = this.ports;
        if (kind === "plugin") return plugins.currentPlugin(id);
        return Promise.resolve(
            rulePackages?.currentRulePackage(id, { hash: true }) ?? { kind: "gone", id, name },
        );
    }

    private sourceOf(kind: AddOnKind): CodeAddOnSource | undefined {
        return { plugin: this.ports.plugins, rulePackage: this.ports.rulePackages }[kind];
    }

    private async buildUntilCurrent(): Promise<void> {
        do {
            this.dirty = false;
            try {
                await this.build();
            } catch (error) {
                this.ports.logger.logError(
                    error instanceof Error ? error : new Error(String(error)),
                );
            }
        } while (this.dirty && this.active);
        // In the tick of the last check, so no invalidate lands between it and the reset.
        this.building = undefined;
    }

    private async build(): Promise<void> {
        const { plugins, rulePackages, restart } = this.ports;
        const facts = await this.reader.read(this.inspected);
        const revision = ++this.revision;
        const { model, shown } = catalogModelOf(
            facts,
            {
                answers: {
                    plugin: plugins.sessionAnswers(),
                    rulePackage: rulePackages?.sessionAnswers() ?? new Map(),
                },
                revokedRulePackages: rulePackages?.revokedThisSession() ?? new Set(),
            },
            restart,
            revision,
        );
        this.revisions = this.revisions.recorded(revision, shown);
        this.latestModel = model;
        this.builtListeners.forEach((listener) => listener(model));
    }

    private track(work: Promise<unknown>): void {
        this.work = Promise.all([this.work, work.catch(() => undefined)]);
    }
}
