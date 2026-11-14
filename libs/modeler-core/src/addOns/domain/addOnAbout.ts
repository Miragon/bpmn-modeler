import {
    RepositoryFacts,
    RepositoryHost,
    RepositoryLicense,
} from "../../kernel/domain/repositoryFacts";
import { AddOnReadme, NO_README } from "./addOnReadme";
import { ShownCode } from "./codeAddOnCatalog";

/**
 * Where a detail's README and license come from: a plugin's or rule
 * package's folder, read when the detail asks, or what a marketplace's cache
 * holds.
 */
export type AboutPlace =
    | { readonly kind: "folder"; readonly dir: string }
    | {
          readonly kind: "marketplace";
          readonly readmeFile?: string;
          readonly repository?: RepositoryFacts;
      };

/** A license as a detail shows it: short on its badge, said in full to a screen reader. */
export interface LicenseView {
    readonly kind: RepositoryLicense["kind"];
    readonly text: string;
    readonly label: string;
}

export interface StarsView {
    readonly text: string;
    readonly label: string;
}

/** What a detail shows below the core's facts, built when the detail asks. */
export interface AddOnAbout {
    readonly readme: AddOnReadme;
    readonly license?: LicenseView;
    readonly stars?: StarsView;
}

export const NO_ABOUT: AddOnAbout = { readme: NO_README };

/** A marketplace as the catalog listed it, with what its cache holds about it. */
export interface MarketplaceAbout {
    readonly sourceId: string;
    readonly readmeFile?: string;
    readonly repository?: RepositoryFacts;
}

/**
 * By the id the view knows, so a view only names what the core showed and
 * never a path of its own. A plugin and a rule package are folders.
 */
export function aboutPlacesOf(
    shown: ReadonlyMap<string, ShownCode>,
    marketplaces: readonly MarketplaceAbout[],
): ReadonlyMap<string, AboutPlace> {
    const places = new Map<string, AboutPlace>();
    shown.forEach(({ id }, addOnId) => places.set(addOnId, { kind: "folder", dir: id }));
    marketplaces.forEach(({ sourceId, readmeFile, repository }) => {
        if (readmeFile === undefined && repository === undefined) return;
        places.set(sourceId, {
            kind: "marketplace",
            ...(readmeFile !== undefined && { readmeFile }),
            ...(repository !== undefined && { repository }),
        });
    });
    return places;
}

const HOST_NAME: Record<RepositoryHost, string> = { github: "GitHub", gitlab: "GitLab" };

/** A package's own word for its license is long only when it points at a file. */
const PACKAGE_LICENSE_MAX = 24;

/** How a repository host's license detection reads on a badge. */
export function repositoryLicenseViewOf(
    host: RepositoryHost,
    license: RepositoryLicense,
): LicenseView {
    switch (license.kind) {
        case "known":
            return {
                kind: "known",
                text: license.id,
                label: `License: ${license.name}, as ${HOST_NAME[host]} detected it`,
            };
        case "other":
            return {
                kind: "other",
                text: "Custom license",
                label: `${HOST_NAME[host]} found a license file it does not recognise. Read it in the repository.`,
            };
        case "none":
            return {
                kind: "none",
                text: "No license",
                label: `${HOST_NAME[host]} found no license file in the repository.`,
            };
    }
}

/**
 * The `license` of a folder's `package.json`, as npm writes it: an SPDX
 * expression, or a legacy `{ type }`. Anything else is no license said.
 */
export function packageLicenseViewOf(manifestText: string): LicenseView | undefined {
    let license: unknown;
    try {
        license = (JSON.parse(manifestText) as { license?: unknown })?.license;
    } catch {
        return undefined;
    }
    const declared =
        typeof license === "object" && license !== null
            ? (license as { type?: unknown }).type
            : license;
    if (typeof declared !== "string" || declared.trim() === "") return undefined;
    const value = declared.trim();
    const short = value.length <= PACKAGE_LICENSE_MAX && !/^SEE LICENSE IN /i.test(value);
    return {
        kind: short ? "known" : "other",
        text: short ? value : "Custom license",
        label: `License: ${value}, as its package.json says`,
    };
}

export function starsViewOf(host: RepositoryHost, stars: number): StarsView {
    const counted = stars === 1 ? "1 star" : `${stars.toLocaleString("en-US")} stars`;
    return {
        text: compactCountText(stars),
        label: `${counted} on ${HOST_NAME[host]}, as of the last marketplace update`,
    };
}

/** 999, 1.2k, 12k, 1.2M: as repository hosts show counts. */
export function compactCountText(count: number): string {
    if (count < 1000) return String(count);
    const [divisor, suffix] = count < 999_500 ? [1000, "k"] : [1_000_000, "M"];
    const scaled = count / divisor;
    const digits = scaled < 10 ? 1 : 0;
    return `${Number(scaled.toFixed(digits))}${suffix}`;
}

/** A marketplace's stars and license, as its cache holds them. */
export function repositoryAboutOf(
    repository: RepositoryFacts | undefined,
): Pick<AddOnAbout, "license" | "stars"> {
    if (repository === undefined) return {};
    const { host, license, stars } = repository;
    return {
        ...(license !== undefined && { license: repositoryLicenseViewOf(host, license) }),
        ...(stars !== undefined && { stars: starsViewOf(host, stars) }),
    };
}
