import { describe, expect, it } from "vitest";

import { BASE_POPUP_MENU_ANNOTATIONS } from "./baseAnnotations";
import { annotateEntry, PopupMenuAnnotations, popupEntryKeyOf } from "./popupMenuAnnotations";

const upperCase = (text: string) => text.toUpperCase();

describe("popupEntryKeyOf", () => {
    it.each([
        ["create-service-task", "service-task"],
        ["append-service-task", "service-task"],
        ["replace-with-service-task", "service-task"],
        ["create-replace-with-non-interrupting-message-start", "non-interrupting-message-start"],
        ["replace-with-subprocess", "expanded-subprocess"],
        ["replace-with-ad-hoc-subprocess", "expanded-ad-hoc-subprocess"],
        ["replace-with-none-start", "none-start-event"],
        ["replace-with-none-end", "none-end-event"],
        ["replace-with-none-intermediate-throw", "none-intermediate-throwing"],
        ["replace-with-none-intermediate-throwing", "none-intermediate-throwing"],
    ])("maps %s to %s", (entryId, key) => {
        expect(popupEntryKeyOf(entryId)).toBe(key);
    });

    it.each([
        "create.template-payment",
        "replace.template-payment",
        "replace-remove-element-template",
        "resources-replace-bpmnProcess-0",
        "toggle-loop",
    ])("leaves %s, which names no element, without a key", (entryId) => {
        expect(popupEntryKeyOf(entryId)).toBeUndefined();
    });
});

describe("PopupMenuAnnotations", () => {
    const base = PopupMenuAnnotations.of(
        { "service-task": "Neutral", "user-task": "Person" },
        { "service-task": ["automation"] },
    );

    it("resolves an entry through its key", () => {
        expect(base.forEntry("replace-with-service-task")).toEqual({
            description: "Neutral",
            keywords: ["automation"],
        });
        expect(base.forEntry("append-user-task")).toEqual({ description: "Person", keywords: [] });
    });

    it("has no annotation for an entry without data or without a key", () => {
        expect(base.forEntry("create-task")).toBeUndefined();
        expect(base.forEntry("replace.template-payment")).toBeUndefined();
    });

    it("annotates a key that has keywords but no description", () => {
        const keywordsOnly = PopupMenuAnnotations.of({}, { task: ["step"] });

        expect(keywordsOnly.forKey("task")).toEqual({ keywords: ["step"] });
    });

    it("replaces only the overridden descriptions and appends keywords", () => {
        const engine = base.withOverrides({
            descriptions: { "service-task": "Engine" },
            additionalKeywords: { "service-task": ["worker"], "send-task": ["worker"] },
        });

        expect(engine.forKey("service-task")).toEqual({
            description: "Engine",
            keywords: ["automation", "worker"],
        });
        expect(engine.forKey("user-task")).toEqual({ description: "Person", keywords: [] });
        expect(engine.forKey("send-task")).toEqual({ keywords: ["worker"] });
    });

    it("leaves the layer it overrides untouched", () => {
        base.withOverrides({
            descriptions: { "service-task": "Engine" },
            additionalKeywords: { "service-task": ["worker"] },
        });

        expect(base.forKey("service-task")).toEqual({
            description: "Neutral",
            keywords: ["automation"],
        });
    });

    it("treats no overrides as the base set", () => {
        expect(base.withOverrides({}).forKey("service-task")).toEqual(base.forKey("service-task"));
    });
});

describe("annotateEntry", () => {
    it("adds the translated description and the keywords as search terms", () => {
        expect(
            annotateEntry(
                { label: "Call activity" },
                { description: "Calls a process", keywords: ["child process"] },
                upperCase,
            ),
        ).toEqual({
            label: "Call activity",
            description: "CALLS A PROCESS",
            search: ["child process"],
        });
    });

    it("keeps a description another provider set", () => {
        expect(
            annotateEntry(
                { description: "From a template" },
                { description: "Calls a process", keywords: [] },
                upperCase,
            ),
        ).toEqual({ description: "From a template" });
    });

    it.each([
        ["one string", "or", ["or", "decision"]],
        ["a list", ["or", "either"], ["or", "either", "decision"]],
    ])("appends the keywords to existing search terms given as %s", (_shape, search, expected) => {
        expect(annotateEntry({ search }, { keywords: ["decision"] }, upperCase)).toEqual({
            search: expected,
        });
    });

    it("leaves the search terms alone without keywords", () => {
        expect(
            annotateEntry(
                { search: "or" },
                { description: "Takes paths", keywords: [] },
                upperCase,
            ),
        ).toEqual({
            description: "TAKES PATHS",
            search: "or",
        });
    });
});

describe("base annotations", () => {
    it("describe the service task without naming an engine's implementation", () => {
        expect(BASE_POPUP_MENU_ANNOTATIONS.forKey("service-task")?.description).toBe(
            "Automated work carried out by a system",
        );
    });

    it.each([
        ["call-activity", "child process"],
        ["receive-task", "message"],
        ["rule-task", "dmn decision"],
        ["user-task", "form human"],
    ])("make %s findable by the engine-neutral keyword %s", (key, keyword) => {
        expect(BASE_POPUP_MENU_ANNOTATIONS.forKey(key)?.keywords).toEqual([keyword]);
    });
});
