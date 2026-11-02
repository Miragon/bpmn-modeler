import {
    findSubclassConstructions,
    readTypeProgram,
    readWorkspaces,
    requireMatches,
} from "@miragon/architecture-testing";
import { WEBVIEW_SURFACE_COMMAND_TYPES } from "@miragon/bpmn-modeler-shared";
import { join, normalize, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A host drops a command it routes nowhere without a sound, and each host
 * routes only what the surface lists name. So every command a webview can
 * post, its libraries included, must be in a list. Found by type, not by name.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const COMMAND_BASE = {
    fileName: join(REPO_ROOT, "libs/shared/src/lib/messages.ts"),
    className: "Command",
};

const listedCommandTypes = new Set<string>(Object.values(WEBVIEW_SURFACE_COMMAND_TYPES).flat());

const isWorkspaceSource = (fileName: string): boolean =>
    fileName.startsWith(`${REPO_ROOT}/`) &&
    !fileName.includes("/node_modules/") &&
    !fileName.endsWith(".d.ts");

// Built at module level so the type check stays out of the test timeout.
const webviews = requireMatches(
    "webview workspaces",
    readWorkspaces(REPO_ROOT).filter(({ dir }) => /^apps\/[^/]+-webview$/.test(dir)),
).map(({ name, dir }) => ({
    name,
    constructions: findSubclassConstructions(
        readTypeProgram(join(REPO_ROOT, dir, "tsconfig.app.json")),
        COMMAND_BASE,
        "type",
        isWorkspaceSource,
    ).map(({ fileName, line, discriminant }) => ({
        site: `${relative(REPO_ROOT, fileName)}:${line}`,
        discriminant,
    })),
}));

describe("webview commands", () => {
    it.each(webviews)("$name constructs commands", ({ constructions }) => {
        expect(constructions).not.toEqual([]);
    });

    it.each(webviews)(
        "every command $name constructs is in a surface list",
        ({ constructions }) => {
            expect(
                constructions
                    .filter(
                        ({ discriminant }) =>
                            discriminant !== undefined && !listedCommandTypes.has(discriminant),
                    )
                    .map(({ discriminant, site }) => `${discriminant} at ${site}`),
            ).toEqual([]);
        },
    );

    it.each(webviews)("every command $name constructs has a literal type", ({ constructions }) => {
        expect(
            constructions
                .filter(({ discriminant }) => discriminant === undefined)
                .map(({ site }) => `a command without a literal type at ${site}`),
        ).toEqual([]);
    });
});
