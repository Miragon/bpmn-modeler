import {
    RepositoryFacts,
    RepositoryHost,
    RepositoryLicense,
} from "../../kernel/domain/repositoryFacts";

/** GitLab names a license by its licensee key, the SPDX id in lower case. */
const SPDX_ID_OF_GITLAB_KEY: Readonly<Record<string, string>> = {
    "mit": "MIT",
    "apache-2.0": "Apache-2.0",
    "gpl-2.0": "GPL-2.0",
    "gpl-3.0": "GPL-3.0",
    "lgpl-2.1": "LGPL-2.1",
    "lgpl-3.0": "LGPL-3.0",
    "agpl-3.0": "AGPL-3.0",
    "bsd-2-clause": "BSD-2-Clause",
    "bsd-3-clause": "BSD-3-Clause",
    "mpl-2.0": "MPL-2.0",
    "epl-2.0": "EPL-2.0",
    "isc": "ISC",
    "unlicense": "Unlicense",
    "cc0-1.0": "CC0-1.0",
};

const HOSTS: readonly RepositoryHost[] = ["github", "gitlab"];

/** `GET /repos/{owner}/{repo}`: `stargazers_count` and the `license` GitHub detected. */
export function githubRepositoryFactsOf(json: unknown): RepositoryFacts {
    const repo = objectOf(json);
    return factsOf("github", repo?.stargazers_count, licenseOf(repo, githubLicenseOf));
}

/** `GET /projects/:id?license=true`: `star_count` and the `license` GitLab detected. */
export function gitlabRepositoryFactsOf(json: unknown): RepositoryFacts {
    const project = objectOf(json);
    return factsOf("gitlab", project?.star_count, licenseOf(project, gitlabLicenseOf));
}

export function formatRepositoryFacts(facts: RepositoryFacts): string {
    return JSON.stringify(facts);
}

/** The cache is a file on disk, so it is read as untrusted as a host's answer. */
export function parseRepositoryFacts(text: string): RepositoryFacts | undefined {
    let parsed: Record<string, unknown> | undefined;
    try {
        parsed = objectOf(JSON.parse(text));
    } catch {
        return undefined;
    }
    const host = HOSTS.find((each) => each === parsed?.host);
    if (host === undefined) return undefined;
    return factsOf(host, parsed?.stars, cachedLicenseOf(parsed?.license));
}

function factsOf(
    host: RepositoryHost,
    stars: unknown,
    license: RepositoryLicense | undefined,
): RepositoryFacts {
    return {
        host,
        ...(isCount(stars) && { stars }),
        ...(license !== undefined && { license }),
    };
}

/** `null` is a repository without a license file; an absent field is a host that did not say. */
function licenseOf(
    owner: Record<string, unknown> | undefined,
    known: (license: Record<string, unknown>) => RepositoryLicense | undefined,
): RepositoryLicense | undefined {
    if (owner === undefined || !("license" in owner)) return undefined;
    if (owner.license === null) return { kind: "none" };
    const license = objectOf(owner.license);
    return license === undefined ? undefined : known(license);
}

function githubLicenseOf({ spdx_id, name }: Record<string, unknown>): RepositoryLicense {
    if (typeof spdx_id !== "string" || spdx_id === "NOASSERTION") return { kind: "other" };
    return { kind: "known", id: spdx_id, name: typeof name === "string" ? name : spdx_id };
}

function gitlabLicenseOf({ key, name }: Record<string, unknown>): RepositoryLicense {
    if (typeof key !== "string" || key === "other") return { kind: "other" };
    const label = typeof name === "string" ? name : key;
    return { kind: "known", id: SPDX_ID_OF_GITLAB_KEY[key] ?? label, name: label };
}

function cachedLicenseOf(value: unknown): RepositoryLicense | undefined {
    const license = objectOf(value);
    switch (license?.kind) {
        case "none":
        case "other":
            return { kind: license.kind };
        case "known":
            return typeof license.id === "string" && typeof license.name === "string"
                ? { kind: "known", id: license.id, name: license.name }
                : undefined;
        default:
            return undefined;
    }
}

function isCount(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function objectOf(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
