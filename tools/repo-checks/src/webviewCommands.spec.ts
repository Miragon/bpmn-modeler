import {
    type BaseClass,
    constructsClass,
    findSubclassConstructions,
    readTypeProgram,
    readWorkspaces,
    requireMatches,
} from "@miragon/architecture-testing";
import { WEBVIEW_SURFACE_COMMAND_TYPES } from "@miragon/bpmn-modeler-shared";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, normalize, relative } from "node:path";
import type * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * A host drops a command it routes nowhere without a sound, and each host
 * routes only what the surface lists name. So every command a webview can
 * post, its libraries included, must be in a list. Found by type, not by name:
 * a webview is an app whose program constructs the host bridge, whatever its
 * directory is called.
 */
const REPO_ROOT = normalize(join(__dirname, "../../.."));
const COMMAND_BASE: BaseClass = {
    fileName: join(REPO_ROOT, "libs/shared/src/lib/messages.ts"),
    className: "Command",
};
// The one class that calls acquireVsCodeApi(), the bridge every host injects into a webview.
const HOST_BRIDGE: BaseClass = {
    fileName: join(REPO_ROOT, "libs/shared/src/lib/host.ts"),
    className: "HostApiImpl",
};
const APP_PROGRAM = "tsconfig.app.json";

const listedCommandTypes = new Set<string>(Object.values(WEBVIEW_SURFACE_COMMAND_TYPES).flat());

const isSourceUnder =
    (root: string) =>
    (fileName: string): boolean =>
        fileName.startsWith(`${root}/`) &&
        !fileName.includes("/node_modules/") &&
        !fileName.endsWith(".d.ts");

interface WebviewProgram {
    readonly name: string;
    readonly dir: string;
    readonly program: ts.Program;
}

function webviewPrograms(root: string, hostBridge: BaseClass): WebviewProgram[] {
    return readWorkspaces(root).flatMap(({ name, dir }) => {
        const tsconfig = join(root, dir, APP_PROGRAM);
        if (!existsSync(tsconfig)) {
            return [];
        }
        const program = readTypeProgram(tsconfig);
        return constructsClass(program, hostBridge, isSourceUnder(root))
            ? [{ name, dir, program }]
            : [];
    });
}

// Built at module level so the type check stays out of the test timeout.
const webviews = requireMatches(
    "webview workspaces",
    webviewPrograms(REPO_ROOT, HOST_BRIDGE),
).map(({ name, program }) => ({
    name,
    constructions: findSubclassConstructions(
        program,
        COMMAND_BASE,
        "type",
        isSourceUnder(REPO_ROOT),
    ).map(({ fileName, line, discriminant }) => ({
        site: `${relative(REPO_ROOT, fileName)}:${line}`,
        discriminant,
    })),
}));

describe("webview commands", () => {
    it("picks a webview by the host bridge it constructs, whatever its directory is called", () => {
        const root = mkdtempSync(join(tmpdir(), "webview-programs-"));
        const appProgram = JSON.stringify({
            compilerOptions: { strict: true, noEmit: true, types: [] },
            include: ["src"],
        });
        const files: Record<string, string> = {
            "package.json": JSON.stringify({ name: "root", workspaces: ["apps/*", "libs/*"] }),
            "libs/bridge/package.json": JSON.stringify({ name: "bridge" }),
            "libs/bridge/src/host.ts": "export class HostApiImpl {}",
            "apps/editor-ui/package.json": JSON.stringify({ name: "editor-ui" }),
            "apps/editor-ui/tsconfig.app.json": appProgram,
            "apps/editor-ui/src/main.ts":
                'import { HostApiImpl } from "../../../libs/bridge/src/host";\nexport const host = new HostApiImpl();',
            "apps/server/package.json": JSON.stringify({ name: "server" }),
            "apps/server/tsconfig.app.json": appProgram,
            "apps/server/src/main.ts": "export const port = 1;",
        };
        try {
            for (const [path, content] of Object.entries(files)) {
                mkdirSync(dirname(join(root, path)), { recursive: true });
                writeFileSync(join(root, path), content);
            }

            const picked = webviewPrograms(root, {
                fileName: join(root, "libs/bridge/src/host.ts"),
                className: "HostApiImpl",
            });

            expect(picked.map(({ dir }) => dir)).toEqual(["apps/editor-ui"]);
        } finally {
            rmSync(root, { recursive: true, force: true });
        }
    });

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
