import { readmeFileNameIn } from "../../kernel/domain/readmeFile";
import { RepositoryFacts } from "../../kernel/domain/repositoryFacts";
import { AboutFetch, aboutFetchFailureOf, MarketplaceAboutFetch } from "../domain/marketplaceAbout";
import { RepositorySource } from "../port/marketplacePorts";

/** Never throws: what describes a marketplace never fails its fetch. */
export async function fetchMarketplaceAbout(
    repository: RepositorySource,
): Promise<MarketplaceAboutFetch> {
    return { readme: await fetchReadme(repository), repository: await fetchFacts(repository) };
}

async function fetchReadme(repository: RepositorySource): Promise<AboutFetch<string>> {
    try {
        const name = readmeFileNameIn(await repository.listRootFiles());
        if (name === undefined) return { kind: "absent" };
        return { kind: "found", value: await repository.fetchFile(name) };
    } catch (error) {
        return aboutFetchFailureOf(error);
    }
}

async function fetchFacts(repository: RepositorySource): Promise<AboutFetch<RepositoryFacts>> {
    if (repository.repositoryFacts === undefined) return { kind: "absent" };
    try {
        return { kind: "found", value: await repository.repositoryFacts() };
    } catch (error) {
        return aboutFetchFailureOf(error);
    }
}
