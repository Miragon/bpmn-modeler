import { describe, expect, expectTypeOf, it } from "vitest";

import {
    decisionButtonText,
    type MergeShapelessValues,
    shapelessEntryText,
    shapelessHeadingText,
    shapelessValueLines,
} from "./mergeRowTexts";
import type { MergeTranslate } from "./mergeTexts";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

describe("shapelessHeadingText", () => {
    it("counts the rows the menu lists", () => {
        expect(shapelessHeadingText(3, untranslated)).toBe("Not visible in the diagram (3)");
    });
});

describe("decisionButtonText", () => {
    it.each<[Parameters<typeof decisionButtonText>[0], string]>([
        [{ kind: "keep", scope: "element", side: "current" }, "Keep current"],
        [{ kind: "leaveOut", side: "current", otherSideLacks: "removed" }, "Leave out"],
        [
            {
                kind: "keepRemovedFlows",
                side: "incoming",
                offer: { elementId: "a", connections: ["f"], removedBy: "current" },
            },
            "Also keep its removed flows",
        ],
        [{ kind: "undo", scope: "element" }, "Undo pick"],
    ])("words a row's button for %o", (decision, expected) => {
        expect(decisionButtonText(decision, untranslated)).toBe(expected);
    });

    it("leaves keeping everything inside to the icon, which the pad's words name", () => {
        expectTypeOf<Parameters<typeof decisionButtonText>[0]>()
            .extract<{ scope: "withContents" }>()
            .toBeNever();
    });
});

describe("shapelessEntryText", () => {
    it.each<[string, { id: string; type: string }, string]>([
        [
            "names the process by its id and type",
            { id: "Process_1", type: "bpmn:Process" },
            "Process_1 (Process)",
        ],
        [
            "names a type of two words with the shared dictionary's spelling",
            { id: "DataStore_1", type: "bpmn:DataStore" },
            "DataStore_1 (Data store)",
        ],
        [
            "keeps the identifier of a type it has no name for",
            { id: "Bogus_1", type: "bpmn:Bogus" },
            "Bogus_1 (bpmn:Bogus)",
        ],
    ])("%s", (_case, entry, expected) => {
        expect(shapelessEntryText(entry, untranslated)).toBe(expected);
    });

    it("names an element by the name the host gives it", () => {
        expect(
            shapelessEntryText(
                { id: "Message_1", type: "bpmn:Message", name: "Order received" },
                untranslated,
            ),
        ).toBe("Order received (Message)");
    });

    // Every root element type, and the data object, which no canvas draws.
    it.each([
        "bpmn:Process",
        "bpmn:Collaboration",
        "bpmn:Message",
        "bpmn:Error",
        "bpmn:Escalation",
        "bpmn:Signal",
        "bpmn:DataStore",
        "bpmn:DataObject",
        "bpmn:ItemDefinition",
        "bpmn:Category",
        "bpmn:Interface",
        "bpmn:EndPoint",
        "bpmn:PartnerEntity",
        "bpmn:PartnerRole",
        "bpmn:Resource",
        "bpmn:CorrelationProperty",
        "bpmn:GlobalTask",
    ])("names %s in words a translation can look up", (type) => {
        const text = shapelessEntryText({ id: "Element_1", type }, (key) => `de:${key}`);

        expect(text).toMatch(/^Element_1 \(de:[A-Z][a-z]+( [a-z]+)*\)$/);
    });
});

describe("shapelessValueLines", () => {
    const lineTexts = (values: MergeShapelessValues) =>
        shapelessValueLines(values, untranslated).map((line) =>
            line.map(({ text }) => text).join(""),
        );

    it.each<[string, MergeShapelessValues, string[]]>([
        [
            "gives each differing attribute both sides' values, the name on a line of its own",
            {
                differences: [
                    {
                        attribute: "name",
                        current: "Payment declined",
                        incoming: "Payment rejected",
                    },
                    { attribute: "errorCode", current: "E1", incoming: "E2" },
                ],
            },
            [
                "name: Current Payment declined · Incoming Payment rejected",
                "errorCode: Current E1 · Incoming E2",
            ],
        ],
        [
            "says none for a side without the attribute",
            {
                differences: [{ attribute: "custom:flag", incoming: "x" }],
            },
            ["custom:flag: Current none · Incoming x"],
        ],
        [
            "says that other content differs beyond the attributes",
            { differences: [], moreDiffers: true },
            ["and other content"],
        ],
        [
            "says that a side removed the element the base holds",
            { lackingSide: { side: "current", lack: "removed" }, differences: [] },
            ["Removed in current"],
        ],
        [
            "says that a side lacks the element without a base",
            { lackingSide: { side: "incoming", lack: "missing" }, differences: [] },
            ["Not in incoming"],
        ],
        ["has no line where nothing it knows differs", { differences: [] }, []],
    ])("%s", (_case, values, expected) => {
        expect(lineTexts(values)).toStrictEqual(expected);
    });

    it("sets the values apart from the words, but not none", () => {
        const [line] = shapelessValueLines(
            { differences: [{ attribute: "errorCode", current: "E1" }] },
            untranslated,
        );

        expect(line?.filter(({ value }) => value).map(({ text }) => text)).toStrictEqual(["E1"]);
    });

    it("names the sides and the lack with the translated words", () => {
        const german = (key: string) => `de:${key}`;

        expect(
            shapelessValueLines(
                { lackingSide: { side: "incoming", lack: "removed" }, differences: [] },
                german,
            ).map((line) => line.map(({ text }) => text).join("")),
        ).toStrictEqual(["de:Removed in incoming"]);
        expect(
            shapelessValueLines(
                { differences: [{ attribute: "errorCode", current: "E1" }] },
                german,
            ).map((line) => line.map(({ text }) => text).join("")),
        ).toStrictEqual(["errorCode: de:Current E1 · de:Incoming de:none"]);
    });
});
