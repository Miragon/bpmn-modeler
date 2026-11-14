import { describe, expect, it } from "vitest";

import { ElementXmlRequestOutcome, ElementXmlRequests } from "./ElementXmlRequests";

type Step =
    | { readonly begin: string; readonly opens: boolean }
    | { readonly settle: number }
    | { readonly abandon: number }
    | { readonly close: true }
    | { readonly closedByUser: true };

type StepRecord = number | "skipped" | ElementXmlRequestOutcome;

/** Runs the steps; a `begin` records its request number or `skipped`, a `settle` its outcome. */
function run(steps: readonly Step[]): StepRecord[] {
    const requests = new ElementXmlRequests();
    const tickets: number[] = [];
    return steps.flatMap((step): StepRecord[] => {
        if ("begin" in step) {
            const ticket = requests.begin(step.begin, step.opens);
            if (ticket === undefined) return ["skipped"];
            tickets.push(ticket);
            return [tickets.length - 1];
        }
        if ("settle" in step) return [requests.settle(tickets[step.settle])];
        if ("close" in step) {
            requests.close();
            return [];
        }
        if ("closedByUser" in step) {
            requests.closedByUser();
            return [];
        }
        requests.abandon(tickets[step.abandon]);
        return [];
    });
}

const show = (elementId: string): Step => ({ begin: elementId, opens: true });
const follow = (elementId: string): Step => ({ begin: elementId, opens: false });

describe("ElementXmlRequests", () => {
    it.each<[string, Step[], StepRecord[]]>([
        ["shows what the context pad asked for", [show("A"), { settle: 0 }], [0, "show"]],
        ["skips a selection before any show was requested", [follow("A")], ["skipped"]],
        [
            "follows a selection while a show is pending",
            [show("A"), follow("B"), { settle: 1 }],
            [0, 1, "show"],
        ],
        [
            "skips a selection again when the only show failed",
            [show("A"), { abandon: 0 }, follow("B")],
            [0, "skipped"],
        ],
        [
            "keeps following after a later show failed",
            [show("A"), { settle: 0 }, show("B"), { abandon: 1 }, follow("C"), { settle: 2 }],
            [0, "show", 1, 2, "refresh"],
        ],
        [
            "retries the element whose latest request failed",
            [show("S"), { settle: 0 }, follow("A"), { abandon: 1 }, follow("A"), { settle: 2 }],
            [0, "show", 1, 2, "refresh"],
        ],
        [
            "still skips the latest element when an overtaken request fails",
            [show("S"), { settle: 0 }, follow("A"), follow("B"), { abandon: 1 }, follow("B")],
            [0, "show", 1, 2, "skipped"],
        ],
        [
            "skips a selection of the element it already follows",
            [show("A"), { settle: 0 }, follow("A")],
            [0, "show", "skipped"],
        ],
        [
            "shows an element again from the context pad",
            [show("A"), { settle: 0 }, show("A"), { settle: 1 }],
            [0, "show", 1, "show"],
        ],
        ["skips a cleared selection", [show(""), follow("")], ["skipped", "skipped"]],
        [
            "drops a request a newer one overtook",
            [show("S"), { settle: 0 }, follow("A"), follow("B"), { settle: 2 }, { settle: 1 }],
            [0, "show", 1, 2, "refresh", "superseded"],
        ],
        [
            "hands an overtaken show to the request that overtook it",
            [show("A"), follow("B"), { settle: 0 }, { settle: 1 }],
            [0, 1, "superseded", "show"],
        ],
        [
            "refreshes after a show has settled",
            [show("A"), { settle: 0 }, follow("B"), { settle: 1 }],
            [0, "show", 1, "refresh"],
        ],
        [
            "forgets a pending show whose request failed",
            [show("S"), { settle: 0 }, show("A"), { abandon: 1 }, follow("B"), { settle: 2 }],
            [0, "show", 1, 2, "refresh"],
        ],
        [
            "drops a request whose diagram diff closed",
            [show("A"), { close: true }, { settle: 0 }],
            [0, "superseded"],
        ],
        [
            "skips a selection after the user closed the XML diff",
            [show("A"), { settle: 0 }, { closedByUser: true }, follow("B")],
            [0, "show", "skipped"],
        ],
        [
            "drops a selection the user's close overtook",
            [show("S"), { settle: 0 }, follow("A"), { closedByUser: true }, { settle: 1 }],
            [0, "show", 1, "superseded"],
        ],
        [
            "drops every selection in flight when the user closes the XML diff",
            [
                show("S"),
                { settle: 0 },
                follow("A"),
                follow("B"),
                { closedByUser: true },
                { settle: 1 },
                { settle: 2 },
            ],
            [0, "show", 1, 2, "superseded", "superseded"],
        ],
        [
            "keeps a pending show when the user closes the XML diff it replaces",
            [show("A"), { settle: 0 }, show("B"), { closedByUser: true }, { settle: 1 }],
            [0, "show", 1, "show"],
        ],
        [
            "follows again once the user asks to show after closing",
            [
                show("A"),
                { settle: 0 },
                { closedByUser: true },
                show("A"),
                { settle: 1 },
                follow("B"),
                { settle: 2 },
            ],
            [0, "show", 1, "show", 2, "refresh"],
        ],
        [
            "keeps the pending show when an overtaken request fails",
            [show("A"), show("B"), { abandon: 0 }, { settle: 1 }],
            [0, 1, "show"],
        ],
    ])("%s", (_case, steps, expected) => {
        expect(run(steps)).toStrictEqual(expected);
    });
});
