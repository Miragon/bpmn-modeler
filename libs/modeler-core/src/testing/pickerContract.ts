import { beforeEach, describe, expect, it } from "vitest";

import { MarketplaceSettingsEntry } from "../kernel/domain/modelerSettings";
import { ChoicePrompt, ConfirmRequest, SearchPrompt } from "../kernel/domain/prompts";
import { PickerPort } from "../kernel/port/hostPorts";

/**
 * One {@link PickerPort} adapter under the {@link describePickerContract}
 * scenarios, with the user who answers it. Each answer is given before the
 * prompt is asked and answers the next prompt the host shows. Rows count from
 * the top of the list the host shows.
 */
export interface PickerContractFixture {
    readonly picker: PickerPort;
    /** The user picks the row at `row` from the list shown for `prompt`. */
    userPicks(prompt: ChoicePrompt<unknown>, row: number): void;
    /** The user checks the rows at `rows` of the list shown for `prompt`, in that order, and accepts. */
    userChecks(prompt: ChoicePrompt<unknown>, rows: readonly number[]): void;
    /** The user closes what is shown for `prompt` without an answer: Escape or a click away. */
    userDismisses(prompt: ChoicePrompt<unknown> | ConfirmRequest): void;
    /** The user presses the confirm button of the dialog shown for `request`. */
    userConfirms(request: ConfirmRequest): void;
    /** The user presses the other button of the dialog shown for `request`. */
    userDeclines(request: ConfirmRequest): void;
    /** The labels of the rows the host listed for the last `choose` or `chooseMany`, top to bottom. */
    shownLabels(): readonly string[];
}

interface PickRow {
    readonly behaviour: string;
    readonly prompt: ChoicePrompt<unknown>;
    readonly row: number;
}

interface CheckRows {
    readonly behaviour: string;
    readonly prompt: ChoicePrompt<unknown>;
    readonly checked: readonly number[];
    readonly returned: readonly number[];
}

interface ConfirmAnswer {
    readonly behaviour: string;
    readonly answer: "userConfirms" | "userDeclines" | "userDismisses";
    readonly confirmed: boolean;
}

interface SearchPick {
    readonly behaviour: string;
    readonly row: number;
    readonly chosen: string;
}

interface LocateOutcome {
    readonly paths: readonly string[];
}

/** Out of label order, so a host that sorted its rows would answer another item. */
const ENGINES: ChoicePrompt<string> = {
    id: "newModelEngine",
    title: "New BPMN model",
    placeholder: "Select the engine",
    items: [
        { label: "Camunda 8", value: "c8" },
        { label: "Camunda 7", value: "c7" },
        { label: "Engine-neutral", description: "Opens in Design mode", value: "neutral" },
    ],
};

/**
 * Two files of the same name, offered by name as `fileChoice` offers them. Out
 * of label and path order, so a host that sorted or reversed its rows would
 * answer another file from the first row.
 */
const LOCATED_FILES: ChoicePrompt<string> = {
    id: "locatedFile",
    placeholder: "Select the file to open",
    items: ["/work/b/order.bpmn", "/work/a/order.bpmn", "/work/a/invoice.bpmn"].map((path) => ({
        label: path.slice(path.lastIndexOf("/") + 1),
        path,
        value: path,
    })),
};

const TARGETS: ChoicePrompt<string> = {
    id: "deploymentTarget",
    placeholder: "Select the active deployment target",
    items: [
        { label: "(none — use form values)", value: "" },
        { label: "dev", value: "dev" },
    ],
};

/** The core keys an entry by its JSON, so only the offered instance is sure to match it. */
const MARKETPLACES: ChoicePrompt<MarketplaceSettingsEntry> = {
    id: "marketplaceRemoval",
    title: "Remove Template Marketplace",
    placeholder: "Select marketplaces to remove",
    items: [
        {
            label: "acme/templates",
            description: "This project",
            value: { provider: "github", repo: "acme/templates" },
        },
        {
            label: "acme/forms",
            description: "All my projects",
            value: { provider: "gitlab", repo: "acme/forms", baseUrl: "https://git.acme.io" },
        },
        { label: "~/templates", description: "This project", value: "~/templates" },
    ],
};

const DELETE_TARGET: ConfirmRequest = {
    id: "deleteTarget",
    title: 'Delete deployment target "dev"?',
    confirmLabel: "Delete",
    details: ['Target "dev" and its stored credentials will be removed.'],
};

const PICKS: readonly PickRow[] = [
    { behaviour: "returns the picked row's value, not its label", prompt: ENGINES, row: 2 },
    {
        behaviour: "keeps the prompt's order, so the first row is its first item",
        prompt: ENGINES,
        row: 0,
    },
    {
        behaviour: "tells files of the same name apart by the row picked",
        prompt: LOCATED_FILES,
        row: 1,
    },
    {
        behaviour: "returns an empty value as itself, which is not a dismissal",
        prompt: TARGETS,
        row: 0,
    },
    {
        behaviour: "returns the offered item's value itself, not a copy",
        prompt: MARKETPLACES,
        row: 1,
    },
];

const CHECKS: readonly CheckRows[] = [
    {
        behaviour:
            "returns the checked rows' values in the prompt's order, whatever order they were checked in",
        prompt: LOCATED_FILES,
        checked: [2, 0],
        returned: [0, 2],
    },
    {
        behaviour: "returns each checked item's value itself, not a copy",
        prompt: MARKETPLACES,
        checked: [0, 1],
        returned: [0, 1],
    },
    {
        behaviour: "returns [] when the user accepts with nothing checked",
        prompt: MARKETPLACES,
        checked: [],
        returned: [],
    },
];

const CONFIRM_ANSWERS: readonly ConfirmAnswer[] = [
    {
        behaviour: "is true when the user presses the confirm button",
        answer: "userConfirms",
        confirmed: true,
    },
    {
        behaviour: "is false when the user presses the other button",
        answer: "userDeclines",
        confirmed: false,
    },
    {
        behaviour: "is false when the user dismisses the dialog",
        answer: "userDismisses",
        confirmed: false,
    },
];

/** Row 0 is where a reversed, path- or label-sorted choice shows another file; row 1 shares its label with row 0. */
const SEARCH_PICKS: readonly SearchPick[] = [
    {
        behaviour: "the first row, so the choice keeps the prompt's order",
        row: 0,
        chosen: "/work/b/order.bpmn",
    },
    {
        behaviour: "a row whose label another row shares",
        row: 1,
        chosen: "/work/a/order.bpmn",
    },
];

function locate(
    search: () => Promise<LocateOutcome>,
): SearchPrompt<LocateOutcome> & { readonly searches: number } {
    let searches = 0;
    return {
        id: "locateFile",
        searchingPlaceholder: "Searching for the process…",
        search: () => {
            searches++;
            return search();
        },
        choices: (outcome) => (outcome.paths.length > 1 ? LOCATED_FILES : undefined),
        get searches() {
            return searches;
        },
    };
}

/** Equal and the same instances: a copy of an entry is not the entry the core offered. */
function expectOfferedValues(chosen: readonly unknown[], offered: readonly unknown[]): void {
    expect(chosen).toEqual(offered);
    chosen.forEach((value, index) => expect(value).toBe(offered[index]));
}

/**
 * The rules of {@link PickerPort} the core relies on, run against one adapter.
 * A host lists the rows in the prompt's order, which the core decides. A pick
 * returns the value of the row the user picked: the offered value itself,
 * never its label or a copy. Checked rows come back in the prompt's order,
 * whatever order the user checked them in, as both hosts return them; the core
 * acts on them in that order. A dismissal is the answer `undefined`, `[]` or
 * `false`, never a rejection. A confirmation is `true` only when the user
 * presses its confirm button. A search runs once, returns its outcome
 * untouched, and asks only for the choice the outcome leaves.
 *
 * Left out:
 * - What a row shows beside its label: VS Code draws icons as codicons and
 *   paths relative to the workspace, and filters on descriptions; the bridge
 *   sends absolute paths and no icon. Each adapter's own spec pins its layout.
 * - The labels a search's choice lists: the kit's fake shows none, so only the
 *   rows of `choose` and `chooseMany` are read back. A search's choice is held
 *   to the prompt's order through its first row, which a reversed, path- or
 *   label-sorted list fills with another file.
 * - That a confirmation is modal, and what shows while a search runs: VS Code
 *   reveals a busy list after 150 ms, the bridge brackets the search with
 *   status-bar progress. Neither reaches the core.
 * - A host that cannot ask, such as a disposed IntelliJ project, which answers
 *   as a dismissal: that is the Kotlin half of the bridge.
 */
export function describePickerContract(
    adapter: string,
    createFixture: () => Promise<PickerContractFixture>,
): void {
    describe(`${adapter} keeps the PickerPort contract`, () => {
        let fixture: PickerContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        describe("choose", () => {
            it("lists every item by its label, in the prompt's order", async () => {
                fixture.userDismisses(ENGINES);

                await fixture.picker.choose(ENGINES);

                expect(fixture.shownLabels()).toEqual(["Camunda 8", "Camunda 7", "Engine-neutral"]);
            });

            it.each(PICKS)("$behaviour", async ({ prompt, row }) => {
                fixture.userPicks(prompt, row);

                const chosen = await fixture.picker.choose(prompt);

                expect(chosen).toBe(prompt.items[row].value);
            });

            it("resolves undefined when the user dismisses the list", async () => {
                fixture.userDismisses(ENGINES);

                await expect(fixture.picker.choose(ENGINES)).resolves.toBeUndefined();
            });
        });

        describe("chooseMany", () => {
            it("lists every item by its label, in the prompt's order", async () => {
                fixture.userDismisses(MARKETPLACES);

                await fixture.picker.chooseMany(MARKETPLACES);

                expect(fixture.shownLabels()).toEqual([
                    "acme/templates",
                    "acme/forms",
                    "~/templates",
                ]);
            });

            it.each(CHECKS)("$behaviour", async ({ prompt, checked, returned }) => {
                fixture.userChecks(prompt, checked);

                const chosen = await fixture.picker.chooseMany(prompt);

                expectOfferedValues(
                    chosen,
                    returned.map((row) => prompt.items[row].value),
                );
            });

            it("resolves [] when the user dismisses the list", async () => {
                fixture.userDismisses(LOCATED_FILES);

                await expect(fixture.picker.chooseMany(LOCATED_FILES)).resolves.toEqual([]);
            });
        });

        describe("confirm", () => {
            it.each(CONFIRM_ANSWERS)("$behaviour", async ({ answer, confirmed }) => {
                fixture[answer](DELETE_TARGET);

                await expect(fixture.picker.confirm(DELETE_TARGET)).resolves.toBe(confirmed);
            });
        });

        describe("searchAndChoose", () => {
            const ambiguous: LocateOutcome = {
                paths: LOCATED_FILES.items.map((item) => item.value),
            };

            it.each(SEARCH_PICKS)(
                "searches once and returns the untouched outcome with the value of $behaviour",
                async ({ row, chosen: picked }) => {
                    const search = locate(async () => ambiguous);
                    fixture.userPicks(LOCATED_FILES, row);

                    const { outcome, chosen } = await fixture.picker.searchAndChoose(search);

                    expect(outcome).toBe(ambiguous);
                    expect(chosen).toBe(picked);
                    expect(search.searches).toBe(1);
                },
            );

            it("returns the untouched outcome and no choice when the user dismisses the list", async () => {
                fixture.userDismisses(LOCATED_FILES);

                const { outcome, chosen } = await fixture.picker.searchAndChoose(
                    locate(async () => ambiguous),
                );

                expect(outcome).toBe(ambiguous);
                expect(chosen).toBeUndefined();
            });

            it("returns no choice when the outcome leaves none, even with an answer ready", async () => {
                const single: LocateOutcome = { paths: ["/work/a/order.bpmn"] };
                fixture.userPicks(LOCATED_FILES, 0);

                const { outcome, chosen } = await fixture.picker.searchAndChoose(
                    locate(async () => single),
                );

                expect(outcome).toBe(single);
                expect(chosen).toBeUndefined();
            });

            it("rejects with the search's own error", async () => {
                const failure = new Error("scan failed");

                await expect(
                    fixture.picker.searchAndChoose(
                        locate(async () => {
                            throw failure;
                        }),
                    ),
                ).rejects.toBe(failure);
            });
        });
    });
}
