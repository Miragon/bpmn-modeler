import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { EngineRoleFolderSources } from "./engineRoleFolderSources";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
    const files: Record<string, string> = {
        "package.json": JSON.stringify({ name: "root", workspaces: ["apps/*", "libs/*"] }),
        "tsconfig.base.json": JSON.stringify({
            compilerOptions: { paths: { "@scope/core": ["./libs/core/src/index.ts"] } },
        }),
        "libs/core/package.json": JSON.stringify({ name: "@scope/core", architecture: "hexagonal" }),
        "libs/core/src/index.ts": 'export * from "./port/DocumentPort";',
        "libs/core/src/port/DocumentPort.ts": "export interface DocumentPort {}",
        "libs/core/src/service/Documents.ts": [
            'import type { DocumentPort } from "../port/DocumentPort";',
            "export class Documents implements DocumentPort {}",
        ].join("\n"),
        "libs/core/src/service/Documents.spec.ts":
            'import type { DocumentPort } from "../port/DocumentPort";\nclass Fake implements DocumentPort {}',
        "libs/core/src/__fixtures__/FakeDocuments.ts":
            'import type { DocumentPort } from "../port/DocumentPort";\nclass Fake implements DocumentPort {}',
        "libs/core/src/globals.d.ts": "declare const version: string;",
        "libs/core/src/theme.css": "",
        "apps/host/package.json": JSON.stringify({ name: "host", architecture: "hexagonal" }),
        "apps/host/src/adapter/out/HostDocuments.tsx": [
            'import type { DocumentPort } from "@scope/core";',
            "export class HostDocuments implements DocumentPort {}",
        ].join("\n"),
        "apps/webview/package.json": JSON.stringify({ name: "webview", architecture: "flat" }),
        "apps/webview/src/Documents.ts":
            'import type { DocumentPort } from "@scope/core";\nclass Documents implements DocumentPort {}',
    };
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
    repository.write("libs/core/src/service/untracked.ts", 'import "vscode";');
});

afterEach(() => {
    repository.remove();
});

describe("the engine role folder sources", () => {
    it("read the tracked sources of each hexagonal workspace, relative to its src/", () => {
        const workspaces = new EngineRoleFolderSources().read(repository.root);

        expect(workspaces.map(({ dir, graph }) => ({ dir, files: graph.files }))).toEqual([
            { dir: "apps/host", files: ["adapter/out/HostDocuments.tsx"] },
            {
                dir: "libs/core",
                files: ["index.ts", "port/DocumentPort.ts", "service/Documents.ts"],
            },
        ]);
        expect(workspaces[1].graph.edges).toContainEqual(
            expect.objectContaining({ from: "service/Documents.ts", to: "port/DocumentPort.ts" }),
        );
    });

    it("resolve each implemented interface across workspaces and path aliases", () => {
        const workspaces = new EngineRoleFolderSources().read(repository.root);

        expect(workspaces.map(({ implementations }) => implementations)).toEqual([
            [
                {
                    path: "apps/host/src/adapter/out/HostDocuments.tsx",
                    line: 2,
                    className: "HostDocuments",
                    interfaceFiles: ["libs/core/src/port/DocumentPort.ts"],
                },
            ],
            [
                {
                    path: "libs/core/src/service/Documents.ts",
                    line: 2,
                    className: "Documents",
                    interfaceFiles: ["libs/core/src/port/DocumentPort.ts"],
                },
            ],
        ]);
    });

    it("read a tree without path aliases", () => {
        repository.git("rm", "--quiet", "tsconfig.base.json");

        const [host] = new EngineRoleFolderSources().read(repository.root);

        expect(host.implementations).toEqual([
            expect.objectContaining({ className: "HostDocuments", interfaceFiles: [] }),
        ]);
    });
});
