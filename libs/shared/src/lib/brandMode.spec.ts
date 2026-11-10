import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COLOR_THEMES, type ColorThemeSetting } from "@miragon/bpmn-modeler-types";

import {
    type BrandMode,
    brandModeAttributes,
    brandModeOf,
    HOST_COLOR_THEME_KINDS,
    type HostColorThemeKind,
} from "./brandMode";

// Shared with the IntelliJ host, which writes the same attributes from Kotlin.
const { cases: CASES } = JSON.parse(
    readFileSync(resolve(__dirname, "brandMode.cases.json"), "utf8"),
) as {
    cases: {
        hostThemeKind: HostColorThemeKind;
        colorThemeSetting: ColorThemeSetting;
        mode: BrandMode;
        attributes: Record<string, string>;
    }[];
};

describe("brandModeOf", () => {
    it.each(CASES)(
        "shows a $hostThemeKind host with the $colorThemeSetting setting as $mode.theme",
        ({ hostThemeKind, colorThemeSetting, mode }) => {
            expect(brandModeOf(hostThemeKind, colorThemeSetting)).toEqual(mode);
        },
    );

    it("has a row for every host theme with every setting", () => {
        const rows = CASES.map((row) => `${row.hostThemeKind}/${row.colorThemeSetting}`);

        expect(new Set(rows)).toEqual(
            new Set(
                HOST_COLOR_THEME_KINDS.flatMap((kind) =>
                    COLOR_THEMES.map((setting) => `${kind}/${setting}`),
                ),
            ),
        );
        expect(rows).toHaveLength(new Set(rows).size);
    });
});

describe("brandModeAttributes", () => {
    it.each(CASES)(
        "writes $attributes for a $hostThemeKind host with the $colorThemeSetting setting",
        ({ mode, attributes }) => {
            expect(brandModeAttributes(mode)).toEqual(attributes);
        },
    );
});
