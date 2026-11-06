import { beforeEach, describe, expect, it } from "vitest";

import {
    MarketplaceAddAnswer,
    MarketplaceAddPrompt,
    marketplaceAddPrompt,
} from "../template-marketplace/domain/marketplacePrompts";
import {
    MarketplaceScope,
    WritableScope,
} from "../template-marketplace/domain/marketplaceRegistrations";
import { MarketplacePromptPort } from "../template-marketplace/port/marketplacePorts";

/** What the user does with one add question, step by step as a host may ask it. */
export type MarketplacePromptReply =
    /** Closes the question before entering a location. */
    | { readonly dismisses: "location" }
    /** Enters a location, then closes the scope choice, or the form that holds both. */
    | { readonly enters: string; readonly dismisses: "scope" }
    /** Enters a location and confirms it, picking `picks` where the question offers a choice. */
    | { readonly enters: string; readonly picks?: MarketplaceScope };

/** The add question as the host showed it to the user. */
export interface ShownMarketplaceQuestion {
    readonly title: string;
    readonly prompt: string;
    readonly placeholder: string;
    /** The entry the user starts from. */
    readonly location: string;
    /** The message shown beside the entry, if any. */
    readonly refusal: string | undefined;
    /** The scope choices in the order shown; none when the host asked no scope. */
    readonly scopes: readonly { readonly label: string; readonly description: string }[];
}

/** One {@link MarketplacePromptPort} adapter under the {@link describeMarketplacePromptContract} scenarios. */
export interface MarketplacePromptContractFixture {
    readonly prompt: MarketplacePromptPort;
    /**
     * Plays the user on the question asked next, the way the host lets them
     * answer it, and resolves once they are done. It is called just before the
     * question is asked and is handed it, as a scripted host reads its answer
     * before it shows anything.
     */
    replyToNext(question: MarketplaceAddPrompt, reply: MarketplacePromptReply): Promise<void>;
    /** The last question as the host showed it. */
    shown(): ShownMarketplaceQuestion;
}

type QuestionHost = Parameters<typeof marketplaceAddPrompt>[0];

const HOME = "/home/ada";
const ENTERED = "https://github.com/acme/templates";

const THIS_PROJECT: WritableScope = {
    scope: "project",
    savedIn: { kind: "file", path: [".editor", "project.json"] },
};
const ALL_PROJECTS: WritableScope = {
    scope: "allProjects",
    savedIn: { kind: "settingsPage", path: ["Preferences", "Template Marketplaces"] },
};
const BOTH_SCOPES: QuestionHost = {
    writable: [THIS_PROJECT, ALL_PROJECTS],
    selfHostedIn: { kind: "file", path: ["settings.json"] },
};
const REFUSED: MarketplaceAddAnswer = {
    location: "https://bitbucket.org/acme/templates",
    scope: "allProjects",
};

const question = (host: QuestionHost = BOTH_SCOPES, refused?: MarketplaceAddAnswer) =>
    marketplaceAddPrompt(host, HOME, refused);

/** Each entry is one the core registers, as VS Code's box accepts no other. */
const ENTRIES: readonly { readonly behaviour: string; readonly entered: string }[] = [
    { behaviour: "with the spaces around it, which the core trims", entered: `  ${ENTERED} ` },
    { behaviour: "as a ~ path, which the core expands", entered: "~/templates" },
    { behaviour: "as a GitHub owner/repo shorthand", entered: "acme/templates" },
    { behaviour: "as a Windows path", entered: "C:\\Users\\ada\\templates" },
    { behaviour: "as a file:// URL", entered: "file:///home/ada/templates" },
];

const DISMISSALS: readonly {
    readonly behaviour: string;
    readonly asked: MarketplaceAddPrompt;
    readonly reply: MarketplacePromptReply;
}[] = [
    {
        behaviour: "before entering a location",
        asked: question(),
        reply: { dismisses: "location" },
    },
    {
        behaviour: "at the scope choice, after entering a location",
        asked: question(),
        reply: { enters: ENTERED, dismisses: "scope" },
    },
    {
        behaviour: "a question that offers no scope choice",
        asked: question({ writable: [ALL_PROJECTS] }),
        reply: { dismisses: "location" },
    },
    {
        behaviour: "a question asked again",
        asked: question(BOTH_SCOPES, REFUSED),
        reply: { dismisses: "location" },
    },
];

/**
 * The rules of {@link MarketplacePromptPort} the core relies on, run against
 * one adapter. The add flow reads the answer back: it checks and registers the
 * entered location in the answer's scope, and asks again with the refused
 * answer and why it refused it. So a dismissal at any step answers
 * `undefined`. An answer carries the location exactly as entered, as the core
 * trims it and expands `~` itself, and the scope the user picked. A question
 * without a scope choice asks no scope and answers with its own scope. A host
 * shows the core's words and scope choices in their order, and on a second
 * ask the refused location with why it was refused. The questions are the
 * ones `marketplaceAddPrompt` builds.
 *
 * Left out:
 * - A check as the user types (`problemWith`): it cannot cross the bridge, and
 *   the core checks every answer, so a host need not refuse an entry itself.
 *   The user enters only locations the core registers, as VS Code's box
 *   accepts no other.
 * - A refusal on the first ask: VS Code shows what the check says under
 *   whatever its box holds, so whether an empty first entry shows one is VS
 *   Code's own behaviour; IntelliJ shows none.
 * - Which scope a host starts from: VS Code's quick pick starts on its first
 *   item, which on a first ask is the question's scope, and VS Code is never
 *   asked again, as its box accepts only a location the core registers;
 *   IntelliJ preselects the question's scope, the refused one included.
 * - Two questions at once: the core asks nothing while its question is open.
 */
export function describeMarketplacePromptContract(
    adapter: string,
    createFixture: () => Promise<MarketplacePromptContractFixture>,
): void {
    describe(`${adapter} keeps the MarketplacePromptPort contract`, () => {
        let fixture: MarketplacePromptContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        async function ask(
            asked: MarketplaceAddPrompt,
            reply: MarketplacePromptReply,
        ): Promise<MarketplaceAddAnswer | undefined> {
            const played = fixture.replyToNext(asked, reply);
            const answer = fixture.prompt.promptForMarketplace(asked);
            const [, answered] = await Promise.all([played, answer]);
            return answered;
        }

        it("shows the core's title, prompt and placeholder, an empty entry and each scope with where it is saved", async () => {
            const asked = question();

            await ask(asked, { enters: ENTERED, picks: "project" });

            expect(asked.scopes).toHaveLength(2);
            expect(fixture.shown()).toMatchObject({
                title: asked.title,
                prompt: asked.prompt,
                placeholder: asked.placeholder,
                location: "",
                scopes: asked.scopes.map(({ label, description }) => ({ label, description })),
            });
        });

        it.each(ENTRIES)(
            "answers the location exactly as entered, $behaviour",
            async ({ entered }) => {
                await expect(
                    ask(question(), { enters: entered, picks: "allProjects" }),
                ).resolves.toEqual({
                    location: entered,
                    scope: "allProjects",
                });
            },
        );

        it.each(question().scopes.map(({ scope, label }) => ({ scope, label })))(
            "answers the scope the user picks: $label",
            async ({ scope }) => {
                await expect(ask(question(), { enters: ENTERED, picks: scope })).resolves.toEqual({
                    location: ENTERED,
                    scope,
                });
            },
        );

        it.each([
            {
                behaviour: "only all projects is writable, as in VS Code without a folder",
                writable: [ALL_PROJECTS],
                scope: "allProjects",
            },
            {
                behaviour: "only this project is writable",
                writable: [THIS_PROJECT],
                scope: "project",
            },
        ] as const)(
            "asks no scope and answers with the question's own when $behaviour",
            async ({ writable, scope }) => {
                const asked = question({ writable });

                const answer = await ask(asked, { enters: ENTERED });

                expect(asked.scopes).toEqual([]);
                expect(answer).toEqual({ location: ENTERED, scope });
                expect(fixture.shown().scopes).toEqual([]);
            },
        );

        it.each(DISMISSALS)(
            "answers undefined when the user dismisses $behaviour",
            async ({ asked, reply }) => {
                await expect(ask(asked, reply)).resolves.toBeUndefined();
            },
        );

        it.each([
            { behaviour: "and where a self-hosted marketplace goes", host: BOTH_SCOPES },
            {
                behaviour: "on a host that cannot register a self-hosted marketplace",
                host: { writable: BOTH_SCOPES.writable },
            },
        ])(
            "shows a refused location again with why the core refused it, $behaviour",
            async ({ host }) => {
                const asked = question(host, REFUSED);

                const answer = await ask(asked, { enters: ENTERED, picks: "allProjects" });

                expect(asked.invalidLocation).toBeDefined();
                expect(fixture.shown()).toMatchObject({
                    location: REFUSED.location,
                    refusal: asked.invalidLocation,
                });
                expect(answer).toEqual({ location: ENTERED, scope: "allProjects" });
            },
        );

        it("starts each question from its own location, as the core asks again after a refusal", async () => {
            await ask(question(), { enters: "~/first", picks: "project" });

            const answer = await ask(question(BOTH_SCOPES, REFUSED), {
                enters: ENTERED,
                picks: "allProjects",
            });

            expect(fixture.shown().location).toBe(REFUSED.location);
            expect(answer).toEqual({ location: ENTERED, scope: "allProjects" });
        });
    });
}
