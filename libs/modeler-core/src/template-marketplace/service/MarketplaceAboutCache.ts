import { FileNotFound, DirectoryNotFound } from "../../kernel/domain/errors";
import { RepositoryFacts } from "../../kernel/domain/repositoryFacts";
import { LoggerPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { MarketplaceRegistration } from "../domain/marketplace";
import { AboutFetch, MarketplaceAboutFetch } from "../domain/marketplaceAbout";
import { formatRepositoryFacts, parseRepositoryFacts } from "../domain/repositoryFactsParsing";
import { WriteQueue } from "./WriteQueue";

type AboutPart = "readme" | "repository";

const ABOUT_FILE: Record<AboutPart, string> = {
    readme: "README.md",
    repository: "facts.json",
};

const ABOUT_WHAT: Record<AboutPart, string> = {
    readme: "README",
    repository: "repository facts",
};

/** A marketplace's cached README and repository facts, each absent until fetched. */
export interface CachedMarketplaceAbout {
    readonly readmeFile?: string;
    readonly repository?: RepositoryFacts;
}

/**
 * What describes each marketplace, cached beside its source slots:
 * `<cacheRoot>/<marketplaceId>/readme/README.md` and `…/repository/facts.json`,
 * each in a folder of its own that no slot index can name, because the port
 * deletes folders, not files. A prune of the marketplace's folder takes them
 * along, so the writes share the slot cache's queue.
 */
export class MarketplaceAboutCache {
    constructor(
        private readonly cacheRoot: string,
        private readonly workspace: WorkspacePort,
        private readonly logger: LoggerPort,
        private readonly writes: WriteQueue,
    ) {}

    /** Never fails the fetch: a README and the repository facts only describe the marketplace. */
    async store(
        registration: MarketplaceRegistration,
        { readme, repository }: MarketplaceAboutFetch,
    ): Promise<void> {
        await this.storePart(registration, "readme", readme, (content) => content);
        await this.storePart(registration, "repository", repository, formatRepositoryFacts);
    }

    /** By the id the marketplace's slots are keyed by. */
    async cachedAboutByRegistration(): Promise<ReadonlyMap<string, CachedMarketplaceAbout>> {
        const byRegistration = new Map<string, CachedMarketplaceAbout>();
        for (const id of await this.cachedMarketplaceIds()) {
            const readmeFile = this.fileOf(id, "readme");
            const hasReadme = (await this.readOptional(readmeFile)) !== undefined;
            const factsText = await this.readOptional(this.fileOf(id, "repository"));
            const repository =
                factsText === undefined ? undefined : parseRepositoryFacts(factsText);
            if (!hasReadme && repository === undefined) continue;
            byRegistration.set(id, {
                ...(hasReadme && { readmeFile }),
                ...(repository !== undefined && { repository }),
            });
        }
        return byRegistration;
    }

    private async storePart<T>(
        { id, url }: MarketplaceRegistration,
        part: AboutPart,
        fetched: AboutFetch<T>,
        format: (value: T) => string,
    ): Promise<void> {
        try {
            switch (fetched.kind) {
                case "found":
                    await this.writes.run(() =>
                        this.workspace.writeFile(this.fileOf(id, part), format(fetched.value)),
                    );
                    return;
                case "absent":
                    await this.writes.run(() =>
                        this.workspace.deleteDirectory(`${this.cacheRoot}/${id}/${part}`),
                    );
                    return;
                case "failed":
                    this.logger.logWarning(
                        `Kept the cached ${ABOUT_WHAT[part]} of "${url}": ${fetched.reason}`,
                    );
                    return;
            }
        } catch (error) {
            this.logger.logWarning(
                `Could not cache the ${ABOUT_WHAT[part]} of "${url}": ${(error as Error).message}`,
            );
        }
    }

    private fileOf(marketplaceId: string, part: AboutPart): string {
        return `${this.cacheRoot}/${marketplaceId}/${part}/${ABOUT_FILE[part]}`;
    }

    private async cachedMarketplaceIds(): Promise<string[]> {
        try {
            const entries = await this.workspace.readDirectory(this.cacheRoot);
            return entries.filter(([, kind]) => kind === "directory").map(([name]) => name);
        } catch (error) {
            if (error instanceof DirectoryNotFound) return [];
            throw error;
        }
    }

    private async readOptional(path: string): Promise<string | undefined> {
        try {
            return await this.workspace.readFile(path);
        } catch (error) {
            if (error instanceof FileNotFound) return undefined;
            throw error;
        }
    }
}
