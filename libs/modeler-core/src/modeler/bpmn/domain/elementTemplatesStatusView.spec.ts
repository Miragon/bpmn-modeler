import { describe, expect, it } from "vitest";

import { StatusView } from "../../../kernel/domain/statusView";
import { elementTemplatesStatusView } from "./elementTemplatesStatusView";
import { TemplateLoadDisplay } from "./TemplateLoadStatus";

interface ViewCase {
    readonly name: string;
    readonly display: TemplateLoadDisplay;
    readonly view: StatusView | undefined;
}

const cases: ViewCase[] = [
    {
        name: "hides the item when no load is shown",
        display: { state: "hidden" },
        view: undefined,
    },
    {
        name: "shows a spinner while templates load",
        display: { state: "loading" },
        view: { text: "Loading element templates…", icon: "loading", tone: "neutral" },
    },
    {
        name: "shows the count for a few seconds once loaded",
        display: { state: "ready", count: 12 },
        view: { text: "Element templates (12)", icon: "check", tone: "neutral", transient: true },
    },
    {
        name: "shows a count of zero when no template was found",
        display: { state: "ready", count: 0 },
        view: { text: "Element templates (0)", icon: "check", tone: "neutral", transient: true },
    },
];

describe("elementTemplatesStatusView", () => {
    it.each(cases)("$name", ({ display, view }) => {
        expect(elementTemplatesStatusView(display)).toEqual(view);
    });
});
