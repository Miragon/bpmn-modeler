import { ActionNoticeTone } from "../../kernel/domain/actionNotice";
import { MarketplaceSettingsEntry } from "../../kernel/domain/modelerSettings";
import { ChoicePrompt, ConfirmRequest } from "../../kernel/domain/prompts";
import { FetchReport, FetchVerdict } from "./fetchReport";
import { marketplaceEntryLabel } from "./marketplace";
import {
    JoinPath,
    MARKETPLACE_SCOPES,
    MarketplaceAddOutcome,
    MarketplaceRegistrations,
    MarketplaceScope,
    RegisteredMarketplace,
    registeredMarketplaceOf,
    registrableLocation,
    RegistrationsByScope,
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

export interface MarketplaceAddNotice {
    readonly severity: ActionNoticeTone;
    readonly message: string;
}

export type MarketplaceRemoval =
    | { readonly kind: "nothingRegistered"; readonly message: string }
    | { readonly kind: "choose"; readonly prompt: ChoicePrompt<MarketplaceSettingsEntry> };

const SCOPE_NAME: Record<MarketplaceScope, string> = {
    project: "this project",
    allProjects: "all my projects",
};

const FETCH_SHORTFALL: Record<Exclude<FetchVerdict, "complete">, string> = {
    partial: "some of its sources could not be fetched",
    nothingFetched: "none of its sources could be fetched",
};

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
                label: `Register for ${SCOPE_NAME[scope]}`,
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

export function marketplaceAddNotice(
    outcome: MarketplaceAddOutcome,
    report: FetchReport,
): MarketplaceAddNotice {
    const headline =
        outcome.kind === "registered"
            ? "Marketplace added"
            : `Marketplace already registered for ${scopesPhrase(outcome.registeredIn)}`;
    const verdict = report.verdict();
    if (verdict === "complete") {
        return { severity: "info", message: `${headline}.` };
    }
    return {
        severity: "warning",
        message: `${headline}, but ${FETCH_SHORTFALL[verdict]}:\n${report.reasons().join("\n")}`,
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
                description: marketplaceScopesText(scopes),
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

function scopesPhrase(scopes: readonly MarketplaceScope[]): string {
    const inAllProjects = scopes.includes("allProjects");
    if (inAllProjects && scopes.includes("project")) {
        return `${SCOPE_NAME.allProjects} and ${SCOPE_NAME.project}`;
    }
    return SCOPE_NAME[inAllProjects ? "allProjects" : "project"];
}

function sentenceCase(phrase: string): string {
    return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

export type MarketplaceRemovalConfirm =
    | { readonly kind: "notRegistered"; readonly message: string }
    | { readonly kind: "confirm"; readonly request: ConfirmRequest };

/** Where an entry is registered, as the removal choice and the add-on catalog name it. */
export function marketplaceScopesText(scopes: readonly MarketplaceScope[]): string {
    return sentenceCase(scopesPhrase(scopes));
}

/** The question before one named entry is removed from every scope that holds it. */
export function marketplaceRemovalConfirm(
    entry: MarketplaceSettingsEntry,
    registered: RegistrationsByScope,
): MarketplaceRemovalConfirm {
    const label = marketplaceEntryLabel(entry);
    const listed = registeredMarketplaceOf(registered, entry);
    if (listed === undefined) {
        return {
            kind: "notRegistered",
            message: `The template marketplace ${label} is no longer registered.`,
        };
    }
    return {
        kind: "confirm",
        request: {
            id: "marketplaceRemovalConfirm",
            title: `Remove the template marketplace ${label}?`,
            confirmLabel: "Remove",
            details: [
                `It is removed from ${scopesPhrase(listed.scopes)}, and its cached templates are deleted.`,
            ],
        },
    };
}
