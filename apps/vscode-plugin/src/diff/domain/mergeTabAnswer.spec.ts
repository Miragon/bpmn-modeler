import { describe, expect, it } from "vitest";

import { MergeTabAnswer } from "./mergeTabAnswer";

function savedBy(manual: boolean, written: string, answer = new MergeTabAnswer()) {
    answer.willSave(manual);
    answer.saved(written);
    return answer;
}

describe("MergeTabAnswer", () => {
    it("answers with the text the last manual save wrote", () => {
        const answer = savedBy(true, "first\n");
        savedBy(true, "second\n", answer);

        expect(answer.onClose(undefined)).toBe("second\n");
    });

    it("answers nothing without a save, or with auto-saves only", () => {
        expect(new MergeTabAnswer().onClose(undefined)).toBeUndefined();
        expect(savedBy(false, "auto\n").onClose("auto\n")).toBeUndefined();
    });

    it("keeps the manual save's text through a later auto-save", () => {
        const answer = savedBy(true, "resolved\n");
        savedBy(false, "half edited\n", answer);

        expect(answer.onClose("half edited\n")).toBe("resolved\n");
    });

    it("answers with the last write when the tab closes while the user accepts the merge", () => {
        const answer = savedBy(false, "auto-saved\n");

        answer.accepting();

        expect(answer.onClose("auto-saved\n")).toBe("auto-saved\n");
    });

    it("answers as before once an accept ended without closing the tab", () => {
        const answer = savedBy(false, "auto-saved\n");
        answer.accepting();

        answer.acceptEnded();

        expect(answer.onClose("auto-saved\n")).toBeUndefined();
    });

    it("answers nothing for a merge closed from code, whatever was saved", () => {
        const answer = savedBy(true, "resolved\n");
        answer.accepting();

        answer.closingFromCode();

        expect(answer.onClose("resolved\n")).toBeUndefined();
    });
});
