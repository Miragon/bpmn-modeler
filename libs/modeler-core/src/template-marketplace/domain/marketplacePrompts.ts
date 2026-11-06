import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { ChoicePrompt } from "../../kernel/domain/prompts";
import { expandHomePath, marketplaceEntryLabel, parseMarketplaceUrl } from "./marketplace";
import {
    MARKETPLACE_SCOPES,
    MarketplaceRegistrations,
    MarketplaceScope,
    RegisteredMarketplace,
    SettingsPlace,
} from "./marketplaceRegistrations";

export interface MarketplaceScopeChoice {
    readonly scope: MarketplaceScope;
    readonly label: string;
    readonly description: string;
}

/**
 * The whole add question, so a host asks it in one form or in steps. A host
 * shows `location` and `scope` as the current answer, and `invalidLocation`
 * beside the location when the core asks again.
 */
export interface MarketplaceAddPrompt {
    readonly title: string;
    readonly prompt: string;
    readonly placeholder: string;
    readonly location: string;
    readonly invalidLocation?: string;
    /** Empty when there is nothing to choose; the answer then carries `scope`. */
    readonly scopes: readonly MarketplaceScopeChoice[];
    readonly scope: MarketplaceScope;
    /**
     * What the core will refuse `input` with, for a host that checks as the
     * user types; it cannot cross the bridge, so the core checks every answer.
     */
    readonly problemWith: (input: string) => string | undefined;
}

export interface MarketplaceAddAnswer {
    readonly location: string;
    readonly scope: MarketplaceScope;
}

export type MarketplaceRemoval =
    | { readonly kind: "nothingRegistered"; readonly message: string }
    | { readonly kind: "choose"; readonly prompt: ChoicePrompt<MarketplaceSettingsEntry> };

type JoinPath = (base: string, rest: string) => string;

const SCOPE_LABEL: Record<MarketplaceScope, string> = {
    project: "Register for this project",
    allProjects: "Register for all my projects",
};

/** The location an add fetches and saves, or `undefined` when `parseMarketplaceUrl` refuses it. */
export function registrableLocation(
    input: string,
    homeDir: string,
    joinPath?: JoinPath,
): string | undefined {
    const location = expandHomePath(input.trim(), homeDir, joinPath);
    try {
        parseMarketplaceUrl(location);
        return location;
    } catch {
        return undefined;
    }
}

/** @param refused the answer whose location the core refused, to ask again about */
export function marketplaceAddPrompt(
    host: Pick<MarketplaceRegistrations, "writable" | "selfHostedIn">,
    homeDir: string,
    refused?: MarketplaceAddAnswer,
    joinPath?: JoinPath,
): MarketplaceAddPrompt {
    const choices = MARKETPLACE_SCOPES.flatMap((scope) =>
        host.writable
            .filter((writable) => writable.scope === scope)
            .map((writable) => ({
                scope,
                label: SCOPE_LABEL[scope],
                description: `Saved in ${placeName(writable.savedIn)}`,
            })),
    );
    const invalidLocation = invalidLocationMessage(host.selfHostedIn);
    return {
        title: "Add Template Marketplace",
        prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
        placeholder: "https://github.com/owner/repo  or  ~/path/to/folder",
        location: refused?.location ?? "",
        ...(refused && { invalidLocation }),
        scopes: choices.length > 1 ? choices : [],
        scope: refused?.scope ?? choices[0]?.scope ?? MARKETPLACE_SCOPES[0],
        problemWith: (input) =>
            registrableLocation(input, homeDir, joinPath) === undefined
                ? invalidLocation
                : undefined,
    };
}

export function marketplaceRemoval(
    registered: readonly RegisteredMarketplace[],
): MarketplaceRemoval {
    if (registered.length === 0) {
        return { kind: "nothingRegistered", message: "No marketplaces registered." };
    }
    return {
        kind: "choose",
        prompt: {
            id: "marketplaceRemoval",
            title: "Remove Template Marketplace",
            placeholder: "Select marketplaces to remove",
            items: registered.map(({ entry, scopes }) => ({
                label: marketplaceEntryLabel(entry),
                description: registeredIn(scopes),
                value: entry,
            })),
        },
    };
}

function invalidLocationMessage(selfHostedIn: SettingsPlace | undefined): string {
    const message =
        "Enter a GitHub or GitLab repository URL, or a local folder path, holding a marketplace.json.";
    return selfHostedIn
        ? `${message} Self-hosted hosts go in ${placeName(selfHostedIn)}.`
        : message;
}

function placeName(place: SettingsPlace): string {
    return place.path.join(place.kind === "file" ? "/" : " ▸ ");
}

function registeredIn(scopes: readonly MarketplaceScope[]): string {
    const inAllProjects = scopes.includes("allProjects");
    if (inAllProjects && scopes.includes("project")) {
        return "All my projects and this project";
    }
    return inAllProjects ? "All my projects" : "This project";
}
