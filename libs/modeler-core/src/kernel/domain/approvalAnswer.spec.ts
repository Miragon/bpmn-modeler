import { describe, expect, expectTypeOf, it } from "vitest";

import { declinedKeys, notAskedAgain, SESSION_ANSWERS, type SessionAnswer } from "./approvalAnswer";

describe("session answers", () => {
    const resizeKey = '["plugin","","folder","/repo/.camunda/plugins/resize-tasks",""]';
    const paletteKey = '["plugin","","folder","/repo/.camunda/plugins/reduced-palette",""]';
    const answers = new Map<string, SessionAnswer>([
        [resizeKey, "declined"],
        [paletteKey, "leftForView"],
    ]);

    it("asks no notice again about an allowance declined or left to the view", () => {
        expect(notAskedAgain(answers)).toEqual(new Set([resizeKey, paletteKey]));
    });

    it("tells the gate only of declined allowances", () => {
        expect(declinedKeys(answers)).toEqual(new Set([resizeKey]));
    });

    it("names each answer a session can hold", () => {
        expectTypeOf<SessionAnswer>().toEqualTypeOf<(typeof SESSION_ANSWERS)[number]>();
        expect(SESSION_ANSWERS).toEqual(["declined", "leftForView"]);
    });
});
