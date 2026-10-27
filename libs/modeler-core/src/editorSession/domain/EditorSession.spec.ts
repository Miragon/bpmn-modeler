import { describe, expect, it } from "vitest";

import { SettingKey } from "../../kernel/domain/modelerSettings";
import { settingChangeNaming } from "./EditorSession";

describe("settingChangeNaming", () => {
    it.each<{ scenario: string; named: SettingKey[]; asked: SettingKey; affects: boolean }>([
        {
            scenario: "affects the key it names",
            named: ["language"],
            asked: "language",
            affects: true,
        },
        {
            scenario: "affects each of the keys it names",
            named: ["alignToOrigin", "scripting.spin"],
            asked: "scripting.spin",
            affects: true,
        },
        {
            scenario: "leaves a key it does not name",
            named: ["language"],
            asked: "configFolder",
            affects: false,
        },
        {
            scenario: "leaves every key when it names none",
            named: [],
            asked: "linting.enabled",
            affects: false,
        },
    ])("$scenario", ({ named, asked, affects }) => {
        expect(settingChangeNaming(named).affects(asked)).toBe(affects);
    });

    it("keeps the keys it was given when the caller's list changes later", () => {
        const named: SettingKey[] = ["language"];
        const change = settingChangeNaming(named);

        named.splice(0, 1, "colorTheme");

        expect([change.affects("language"), change.affects("colorTheme")]).toEqual([true, false]);
    });
});
