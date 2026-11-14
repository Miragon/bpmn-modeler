import { describe, expect, it } from "vitest";

import { aboutOnArrival, aboutRequestOf, type AboutShown } from "./aboutRequest";

const ACME: AboutShown = { targetId: "plugin:/acme", about: { readme: { kind: "none" } } };

const VIEW = {
    revision: 3,
    selectedId: "plugin:/acme",
    showsDetail: true,
    about: undefined,
    aboutAsked: undefined,
};

describe("aboutOnArrival", () => {
    it("shows an answer for the selection and drops a late one", () => {
        expect(aboutOnArrival("plugin:/acme", undefined, ACME)).toBe(ACME);
        expect(aboutOnArrival("plugin:/other", undefined, ACME)).toBeUndefined();
    });
});

describe("aboutRequestOf", () => {
    it("asks about a new selection", () => {
        expect(aboutRequestOf(VIEW)).toEqual({
            askAbout: "plugin:/acme",
            aboutAsked: { targetId: "plugin:/acme", revision: 3 },
        });
    });

    it("asks again for a new model and keeps the target's answer meanwhile", () => {
        expect(
            aboutRequestOf({
                ...VIEW,
                revision: 4,
                about: ACME,
                aboutAsked: { targetId: "plugin:/acme", revision: 3 },
            }),
        ).toEqual({
            askAbout: "plugin:/acme",
            aboutAsked: { targetId: "plugin:/acme", revision: 4 },
            about: ACME,
        });
    });

    it.each([
        {
            case: "what it already asked",
            view: { aboutAsked: { targetId: "plugin:/acme", revision: 3 } },
        },
        { case: "before a model", view: { revision: undefined } },
        { case: "without a selection", view: { selectedId: undefined } },
        { case: "in a view without a detail", view: { showsDetail: false } },
    ])("asks nothing $case", ({ view }) => {
        expect(aboutRequestOf({ ...VIEW, ...view })).toBeUndefined();
    });
});
