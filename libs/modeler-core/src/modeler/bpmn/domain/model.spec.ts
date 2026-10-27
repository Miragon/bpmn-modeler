import { describe, expect, it } from "vitest";

import { DEFAULT_MODELER_SETTINGS } from "../../../kernel/domain/modelerSettings";
import { SettingBuilder } from "./model";

describe("SettingBuilder", () => {
    it("builds with the shared setting defaults", () => {
        const setting = new SettingBuilder().buildBpmnModeler();

        expect(setting.alignToOrigin).toBe(DEFAULT_MODELER_SETTINGS.alignToOrigin);
        expect(setting.showTransactionBoundaries).toBe(
            DEFAULT_MODELER_SETTINGS.showTransactionBoundaries,
        );
        expect(setting.colorTheme).toBe(DEFAULT_MODELER_SETTINGS.colorTheme);
        expect(setting.favouriteBpmnElements).toEqual(
            DEFAULT_MODELER_SETTINGS.favouriteBpmnElements,
        );
    });

    it("returns the same builder from each setter so calls can chain", () => {
        const builder = new SettingBuilder();

        expect(builder.alignToOrigin(true)).toBe(builder);
        expect(builder.showTransactionBoundaries(false)).toBe(builder);
        expect(builder.colorTheme("light")).toBe(builder);
        expect(builder.favouriteBpmnElements(["bpmn:Task"])).toBe(builder);
    });

    it("carries every configured field into the built setting", () => {
        const setting = new SettingBuilder()
            .alignToOrigin(true)
            .showTransactionBoundaries(false)
            .colorTheme("light")
            .favouriteBpmnElements(["bpmn:Task", "bpmn:Gateway"])
            .buildBpmnModeler();

        expect(setting.alignToOrigin).toBe(true);
        expect(setting.showTransactionBoundaries).toBe(false);
        expect(setting.colorTheme).toBe("light");
        expect(setting.favouriteBpmnElements).toEqual(["bpmn:Task", "bpmn:Gateway"]);
    });
});
