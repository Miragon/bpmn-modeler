import { describe, expect, it } from "vitest";

import { TemplateLoadDisplay, TemplateLoadStatus } from "./TemplateLoadStatus";

type LoadEvent =
    | { readonly started: string }
    | { readonly finished: string; readonly count: number }
    | { readonly abandoned: string };

interface DisplayCase {
    readonly name: string;
    readonly events: readonly LoadEvent[];
    readonly display: TemplateLoadDisplay;
}

function statusAfter(events: readonly LoadEvent[]): TemplateLoadStatus {
    const tokens = new Map<string, symbol>();
    const tokenOf = (load: string) => {
        const token = tokens.get(load) ?? Symbol(load);
        tokens.set(load, token);
        return token;
    };
    return events.reduce((status, event) => {
        if ("started" in event) return status.started(tokenOf(event.started));
        if ("finished" in event) return status.finished(tokenOf(event.finished), event.count);
        return status.abandoned(tokenOf(event.abandoned));
    }, TemplateLoadStatus.idle);
}

const cases: DisplayCase[] = [
    {
        name: "shows nothing before any load",
        events: [],
        display: { state: "hidden" },
    },
    {
        name: "shows the spinner while a load runs",
        events: [{ started: "a" }],
        display: { state: "loading" },
    },
    {
        name: "keeps the spinner when one of two running loads finishes",
        events: [{ started: "a" }, { started: "b" }, { finished: "a", count: 3 }],
        display: { state: "loading" },
    },
    {
        name: "shows the count of the load that finishes last",
        events: [
            { started: "a" },
            { started: "b" },
            { finished: "a", count: 3 },
            { finished: "b", count: 5 },
        ],
        display: { state: "ready", count: 5 },
    },
    {
        name: "keeps the spinner when a superseded load ends while another runs",
        events: [{ started: "a" }, { started: "b" }, { abandoned: "a" }],
        display: { state: "loading" },
    },
    {
        name: "hides when a failure is the last event",
        events: [
            { started: "a" },
            { started: "b" },
            { finished: "a", count: 3 },
            { abandoned: "b" },
        ],
        display: { state: "hidden" },
    },
    {
        name: "hides a finished count when a load that never ran fails",
        events: [{ started: "a" }, { finished: "a", count: 3 }, { abandoned: "b" }],
        display: { state: "hidden" },
    },
    {
        name: "shows the spinner again when a load starts after another finished",
        events: [{ started: "a" }, { finished: "a", count: 3 }, { started: "b" }],
        display: { state: "loading" },
    },
];

describe("TemplateLoadStatus", () => {
    it.each(cases)("$name", ({ events, display }) => {
        expect(statusAfter(events).display).toEqual(display);
    });

    it("leaves the status it was derived from unchanged", () => {
        const load = Symbol("a");
        const running = TemplateLoadStatus.idle.started(load);

        running.finished(load, 3);

        expect(TemplateLoadStatus.idle.display).toEqual({ state: "hidden" });
        expect(running.display).toEqual({ state: "loading" });
    });
});
