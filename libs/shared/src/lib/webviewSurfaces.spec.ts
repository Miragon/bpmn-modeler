import { describe, expect, it } from "vitest";

import * as addOnsViewMessages from "./addOnsView";
import * as dmnDiffMessages from "./dmnDiffMessages";
import * as baseMessages from "./messages";
import { Command } from "./messages";
import * as modelerMessages from "./modeler";
import { WEBVIEW_SURFACE_COMMAND_TYPES } from "./webviewSurfaces";

type CommandClass = new () => Command;

const protocolCommandTypes = Object.values<unknown>({
    ...baseMessages,
    ...modelerMessages,
    ...addOnsViewMessages,
    ...dmnDiffMessages,
})
    .filter(
        (value): value is CommandClass =>
            typeof value === "function" && value.prototype instanceof Command,
    )
    .map((Cls) => Reflect.construct(Cls, []).type)
    // The abstract LogMessageCommand fixes no type.
    .filter((type): type is string => type !== undefined);

const surfaceLists = Object.entries<readonly string[]>(WEBVIEW_SURFACE_COMMAND_TYPES).map(
    ([surface, listed]) => ({ surface, listed }),
);

describe("WEBVIEW_SURFACE_COMMAND_TYPES", () => {
    it.each(surfaceLists)("$surface lists every command type at most once", ({ listed }) => {
        expect(listed).toEqual([...new Set(listed)]);
    });

    it.each(surfaceLists)("$surface lists only protocol command types", ({ listed }) => {
        expect(listed.filter((type) => !protocolCommandTypes.includes(type))).toEqual([]);
    });

    it("lists the add-ons view's commands, and only those, on its surface", () => {
        expect(WEBVIEW_SURFACE_COMMAND_TYPES).toHaveProperty("addOnsView", [
            "LogInfoCommand",
            "LogErrorCommand",
            "GetAddOnCatalogCommand",
            "AddOnRequestCommand",
            "OpenAddOnDetailCommand",
        ]);
    });

    it("lists every protocol command type on at least one surface", () => {
        const listed = new Set(surfaceLists.flatMap(({ listed }) => listed));

        expect(protocolCommandTypes.filter((type) => !listed.has(type))).toEqual([]);
    });
});
