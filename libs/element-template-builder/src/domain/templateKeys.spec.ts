import { describe, expect, it } from "vitest";

import { jsonOnlyGroupKeys, jsonOnlyPropertyKeys, jsonOnlyTemplateKeys } from "./templateKeys";

describe("the keys left to the JSON", () => {
    it("names what the template form has no field for", () => {
        expect(
            jsonOnlyTemplateKeys({
                "$schema": "s",
                "name": "n",
                "appliesTo": [],
                "icon": {},
                "engines": {},
                "x-custom": 1,
            }),
        ).toEqual(["icon", "engines", "x-custom"]);
    });

    it("names what the property form has no field for", () => {
        const property = { "label": "l", "type": "Text", "language": "json", "x-custom": 1 };

        expect(jsonOnlyPropertyKeys(property, true)).toEqual(["language", "x-custom"]);
    });

    it.each(["id", "tooltip", "optional", "feel", "condition"])(
        "counts a property's %s as the JSON's where the engine has no field for it",
        (key) => {
            expect(jsonOnlyPropertyKeys({ [key]: 1 }, true)).toEqual([]);
            expect(jsonOnlyPropertyKeys({ [key]: 1 }, false)).toEqual([key]);
        },
    );

    it("names what the group form has no field for", () => {
        expect(jsonOnlyGroupKeys({ "id": "a", "label": "A", "x-custom": 1 })).toEqual(["x-custom"]);
    });
});
