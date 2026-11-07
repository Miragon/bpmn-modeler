import { join } from "path";

import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { NotifierPort, PickerPort } from "../../kernel/port/hostPorts";
import {
    MarketplaceAddAnswer,
    MarketplaceAddNotice,
    marketplaceAddNotice,
    marketplaceAddPrompt,
    marketplaceRemoval,
} from "../domain/marketplacePrompts";
import {
    marketplaceAddOutcome,
    MarketplaceAddOutcome,
    MarketplaceScope,
    registeredMarketplaces,
    registrableLocation,
} from "../domain/marketplaceRegistrations";
import { MarketplacePromptPort, MarketplaceRegistrationsPort } from "../port/marketplacePorts";
import { TemplateMarketplaceService } from "./TemplateMarketplaceService";

export interface MarketplaceTemplates {
    reloadMarketplaceTemplates(): Promise<void>;
}

export interface MarketplaceCommandPorts {
    readonly marketplaces: TemplateMarketplaceService;
    readonly templates: MarketplaceTemplates;
    readonly registrations: MarketplaceRegistrationsPort;
    readonly prompt: MarketplacePromptPort;
    readonly picker: PickerPort;
    readonly notifier: NotifierPort;
    /** Expands `~` in an entered path; the core cannot read it. */
    readonly homeDir: string;
    /**
     * Lets a host replace the generic failure toast with a host-specific
     * remedy; resolves `true` when it reported the failure.
     */
    readonly explainAddFailure?: (error: Error) => Promise<boolean>;
}

/**
 * The add, update and remove flows behind the marketplace commands of every
 * host. The host renders the questions the core builds and keeps the
 * registrations in its own stores; after each flow the open editors show the
 * changed templates.
 *
 * The flows run one at a time, a later one waiting under its progress: a prune
 * keeps only the registered marketplaces, so it must not run while an add has
 * cached a marketplace it has not registered yet, nor while an update works
 * from the registrations it read before a removal. The questions are asked
 * before a flow queues, so a user who takes their time holds up no other flow.
 * A command started again while its question is open asks nothing: IntelliJ
 * would queue a second modal dialog behind the first.
 */
export class MarketplaceCommands {
    private runs: Promise<unknown> = Promise.resolve();
    private readonly asking = new Set<string>();

    constructor(private readonly ports: MarketplaceCommandPorts) {}

    /**
     * Registers the location only after its `marketplace.json` was read, so a
     * location without one never lands in the host's settings. A valid manifest
     * whose sources all failed is still registered: a later update may reach
     * them. The location is registered expanded, so a later update never sees a `~`.
     * An entry already registered is still fetched: the cache is per workspace,
     * and only an add or an update fills it.
     */
    async add(): Promise<void> {
        const { notifier } = this.ports;
        notifier.logInfo("Add Marketplace command invoked");
        try {
            const answer = await this.askAlone("Add Marketplace", () => this.askForMarketplace());
            if (!answer) {
                notifier.logDebug("Add Marketplace cancelled");
                return;
            }
            const notice = await notifier.withProgress("Adding marketplace…", () =>
                this.oneAtATime(() => this.fetchAndRegister(answer)),
            );
            this.showNotice(notice);
        } catch (error) {
            await this.reportAddFailure(error as Error);
        }
    }

    /**
     * Per-marketplace errors are folded into one summary toast, so an update
     * never blocks, even fully offline.
     */
    async update(): Promise<void> {
        const { notifier, marketplaces, templates } = this.ports;
        const outcome = await notifier.withProgress("Updating marketplaces…", () =>
            this.oneAtATime(async () => {
                const updated = await marketplaces.updateAll();
                await templates.reloadMarketplaceTemplates();
                return updated;
            }),
        );

        const total = outcome.succeeded + outcome.failures.length;
        if (total === 0) {
            notifier.showInfo("No marketplaces configured to update.");
            return;
        }
        if (outcome.failures.length === 0) {
            notifier.showInfo(`Updated ${outcome.succeeded} marketplace(s).`);
            return;
        }
        const details = outcome.failures.map((f) => `${f.label}: ${f.reason}`).join("\n");
        notifier.showError(
            `Updated ${outcome.succeeded} of ${total} marketplaces. Failed:\n${details}`,
        );
    }

    /**
     * The choice's OK is the confirmation (adding again is cheap). Prunes only
     * the cache slots the removal orphaned and never fetches the survivors
     * again. The toast counts the chosen entries, not the pruned slots: a
     * removed entry may have had none.
     */
    async remove(): Promise<void> {
        const { notifier, registrations, marketplaces, templates } = this.ports;
        notifier.logInfo("Remove Marketplace command invoked");
        try {
            const chosen = await this.askAlone("Remove Marketplace", () => this.askForRemoval());
            if (!chosen?.length) {
                notifier.logDebug("Remove Marketplace cancelled");
                return;
            }
            await notifier.withProgress("Removing marketplace(s)…", () =>
                this.oneAtATime(async () => {
                    await registrations.unregister(chosen);
                    await marketplaces.pruneOrphanedCaches();
                    await templates.reloadMarketplaceTemplates();
                }),
            );
            notifier.showInfo(`Removed ${chosen.length} marketplace(s).`);
        } catch (error) {
            notifier.notifyError("Failed to remove marketplace(s).", error as Error);
        }
    }

    private async askAlone<T>(command: string, ask: () => Promise<T>): Promise<T | undefined> {
        if (this.asking.has(command)) {
            this.ports.notifier.logDebug(`${command} is already asking`);
            return undefined;
        }
        this.asking.add(command);
        try {
            return await ask();
        } finally {
            this.asking.delete(command);
        }
    }

    /** The entries the user chose, or none when nothing is registered. */
    private async askForRemoval(): Promise<readonly MarketplaceSettingsEntry[]> {
        const { registrations, picker, notifier } = this.ports;
        const removal = marketplaceRemoval(
            registeredMarketplaces((await registrations.read()).registered),
        );
        if (removal.kind === "nothingRegistered") {
            notifier.showInfo(removal.message);
            return [];
        }
        return picker.chooseMany(removal.prompt);
    }

    /** Asks again, with the refused entry, until the location is one the core can register. */
    private async askForMarketplace(): Promise<MarketplaceAddAnswer | undefined> {
        const { registrations, prompt, homeDir } = this.ports;
        const host = await registrations.read();
        let refused: MarketplaceAddAnswer | undefined;
        for (;;) {
            const answer = await prompt.promptForMarketplace(
                marketplaceAddPrompt(host, homeDir, refused, join),
            );
            if (!answer) return undefined;
            const location = registrableLocation(answer.location, homeDir, join);
            if (location !== undefined) return { location, scope: answer.scope };
            refused = answer;
        }
    }

    /**
     * The fetch caches before the registration, so a failed add must not leave
     * that cache behind. The registrations are read again here, in the queue,
     * as a removal may have run since the question read them.
     */
    private async fetchAndRegister({
        location,
        scope,
    }: MarketplaceAddAnswer): Promise<MarketplaceAddNotice> {
        const { marketplaces, templates } = this.ports;
        try {
            const report = await marketplaces.addMarketplace(location);
            const outcome = await this.registerUnlessRegistered(location, scope);
            await templates.reloadMarketplaceTemplates();
            return marketplaceAddNotice(outcome, report);
        } catch (error) {
            await marketplaces.pruneOrphanedCaches();
            throw error;
        }
    }

    private async registerUnlessRegistered(
        location: string,
        scope: MarketplaceScope,
    ): Promise<MarketplaceAddOutcome> {
        const { registrations, notifier } = this.ports;
        const outcome = marketplaceAddOutcome(
            (await registrations.read()).registered,
            location,
            scope,
        );
        if (outcome.kind === "alreadyRegistered") {
            notifier.logDebug(`Marketplace already registered: ${location}`);
            return outcome;
        }
        await registrations.register(location, scope);
        notifier.logDebug(`Marketplace registration persisted: ${location}`);
        return outcome;
    }

    private showNotice({ severity, message }: MarketplaceAddNotice): void {
        if (severity === "warning") this.ports.notifier.showWarning(message);
        else this.ports.notifier.showInfo(message);
    }

    // Outside the queue: a host's explanation may wait for a click.
    private async reportAddFailure(error: Error): Promise<void> {
        if (await this.ports.explainAddFailure?.(error)) return;
        this.ports.notifier.notifyError("Failed to add marketplace.", error);
    }

    private oneAtATime<T>(run: () => Promise<T>): Promise<T> {
        const done = this.runs.then(run);
        this.runs = done.catch(() => undefined);
        return done;
    }
}
