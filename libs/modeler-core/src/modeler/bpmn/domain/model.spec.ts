import { describe, expect, it } from "vitest";

import { SettingBuilder } from "./model";

describe("SettingBuilder", () => {
    it("builds with the documented defaults", () => {
        const setting = new SettingBuilder().buildBpmnModeler();

        expect(setting.alignToOrigin).toBe(false);
        expect(setting.showTransactionBoundaries).toBe(true);
        expect(setting.colorTheme).toBe("automatic");
        expect(setting.favouriteBpmnElements).toEqual([]);
        expect(setting.fitOnDrilldown).toBe(false);
    });

    it("returns the same builder from each setter so calls can chain", () => {
        const builder = new SettingBuilder();

        expect(builder.alignToOrigin(true)).toBe(builder);
        expect(builder.showTransactionBoundaries(false)).toBe(builder);
        expect(builder.colorTheme("light")).toBe(builder);
        expect(builder.favouriteBpmnElements(["bpmn:Task"])).toBe(builder);
        expect(builder.fitOnDrilldown(true)).toBe(builder);
    });

    it("carries every configured field into the built setting", () => {
        const setting = new SettingBuilder()
            .alignToOrigin(true)
            .showTransactionBoundaries(false)
            .colorTheme("light")
            .favouriteBpmnElements(["bpmn:Task", "bpmn:Gateway"])
            .fitOnDrilldown(true)
            .buildBpmnModeler();

        expect(setting.alignToOrigin).toBe(true);
        expect(setting.showTransactionBoundaries).toBe(false);
        expect(setting.colorTheme).toBe("light");
        expect(setting.favouriteBpmnElements).toEqual(["bpmn:Task", "bpmn:Gateway"]);
        expect(setting.fitOnDrilldown).toBe(true);
    });
});
