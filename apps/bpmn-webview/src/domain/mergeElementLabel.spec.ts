import { describe, expect, it } from "vitest";

import { mergeElementLabel } from "./mergeElementLabel";
import type { MergeTranslate } from "./mergeTexts";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

describe("mergeElementLabel", () => {
    it("names an element by its name", () => {
        expect(mergeElementLabel({ id: "Task_1", name: "Pack parcel" }, untranslated)).toBe(
            "Pack parcel",
        );
    });

    it("names an unnamed flow by the names of its ends", () => {
        expect(
            mergeElementLabel(
                {
                    id: "flow_reminderToSendMail",
                    flowEnds: { source: "7 days", target: "Send reminder email" },
                },
                untranslated,
            ),
        ).toBe("Flow from 7 days to Send reminder email");
    });

    it("keeps a flow's own name, and treats a blank name as none", () => {
        const flowEnds = { source: "A", target: "B" };

        expect(mergeElementLabel({ id: "Flow_1", name: "yes", flowEnds }, untranslated)).toBe(
            "yes",
        );
        expect(mergeElementLabel({ id: "Flow_1", name: "  ", flowEnds }, untranslated)).toBe(
            "Flow from A to B",
        );
    });

    it("names anything else without a name by its id", () => {
        expect(mergeElementLabel({ id: "Error_1" }, untranslated)).toBe("Error_1");
        expect(mergeElementLabel({ id: "Task_1", name: "" }, untranslated)).toBe("Task_1");
    });

    it("translates the flow's words, not the names of its ends", () => {
        const german: MergeTranslate = (key, replacements = {}) =>
            key === "Flow from {source} to {target}"
                ? `Fluss von ${replacements.source} nach ${replacements.target}`
                : key;

        expect(
            mergeElementLabel({ id: "F", flowEnds: { source: "Start", target: "End" } }, german),
        ).toBe("Fluss von Start nach End");
    });
});
