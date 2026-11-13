import { rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../../fitness/__fixtures__/tempGitRepository";
import { EngineHostTextSources } from "./engineHostTextSources";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
    const files: Record<string, string> = {
        "tsconfig.base.json": JSON.stringify({
            compilerOptions: {
                paths: { "@miragon/bpmn-modeler-core": ["./libs/modeler-core/src/index.ts"] },
            },
        }),
        "libs/modeler-core/src/index.ts":
            'export type { NotifierPort, PickerPort } from "./kernel/port/hostPorts";',
        "libs/modeler-core/src/kernel/port/hostPorts.ts":
            "export interface NotifierPort {}\nexport interface PickerPort {}",
        "apps/bridge/src/adapter/out/RpcNotifier.ts": [
            'import type { NotifierPort, PickerPort } from "@miragon/bpmn-modeler-core";',
            'import { send } from "../../transport";',
            "export class RpcNotifier implements NotifierPort {}",
            "export class RpcPicker implements PickerPort {}",
        ].join("\n"),
        "apps/host/src/adapter/in/Controller.ts": [
            'import { window } from "vscode";',
            'import type { Uri } from "vscode";',
            'window.showErrorMessage("Could not save");',
        ].join("\n"),
        "apps/host/src/adapter/in/Controller.spec.ts": 'import { window } from "vscode";',
        "apps/intellij/src/main/kotlin/x/Action.kt": [
            "package x",
            "",
            "import com.intellij.openapi.ui.Messages",
            "import com.intellij.openapi.ui.Messages",
            "",
            'fun ask(name: String) = Messages.showInfoMessage(null, "Could not save $name", "Save")',
            "private val log = Logger.getInstance(Action::class.java)",
        ].join("\n"),
        "apps/intellij/src/test/kotlin/x/ActionTest.kt": "import com.intellij.testFramework.X",
        "apps/host/scripts/package.mjs": 'import { window } from "vscode";',
        "apps/host/src/deleted.ts": 'import { window } from "vscode";',
    };
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
    repository.write("apps/host/src/untracked.ts", 'import { window } from "vscode";');
    rmSync(join(repository.root, "apps/host/src/deleted.ts"));
});

afterEach(() => {
    repository.remove();
});

describe("the engine host text sources", () => {
    it("read what each tracked TypeScript and Kotlin source imports and whose interfaces its classes implement", () => {
        expect(new EngineHostTextSources().readDependencies(repository.root)).toEqual([
            {
                path: "apps/bridge/src/adapter/out/RpcNotifier.ts",
                importedSpecifiers: ["@miragon/bpmn-modeler-core", "../../transport"],
                implementedInterfaceFiles: ["libs/modeler-core/src/kernel/port/hostPorts.ts"],
            },
            {
                path: "apps/host/src/adapter/in/Controller.ts",
                importedSpecifiers: ["vscode"],
                implementedInterfaceFiles: [],
            },
            {
                path: "apps/intellij/src/main/kotlin/x/Action.kt",
                importedSpecifiers: ["com.intellij.openapi.ui.Messages"],
                implementedInterfaceFiles: [],
            },
            {
                path: "libs/modeler-core/src/index.ts",
                importedSpecifiers: ["./kernel/port/hostPorts"],
                implementedInterfaceFiles: [],
            },
            {
                path: "libs/modeler-core/src/kernel/port/hostPorts.ts",
                importedSpecifiers: [],
                implementedInterfaceFiles: [],
            },
        ]);
    });

    it("read the texts written in one file", () => {
        expect(
            new EngineHostTextSources().readSource(
                repository.root,
                "apps/host/src/adapter/in/Controller.ts",
            ),
        ).toEqual({
            texts: [
                {
                    line: 3,
                    parts: ["Could not save"],
                    argumentOf: [
                        { construct: false, callee: "showErrorMessage", receiver: "window" },
                    ],
                },
            ],
            initializedValues: [],
        });
    });

    it("read the texts written in one Kotlin file and the values it initializes with a call", () => {
        expect(
            new EngineHostTextSources().readSource(
                repository.root,
                "apps/intellij/src/main/kotlin/x/Action.kt",
            ),
        ).toEqual({
            texts: [
                {
                    line: 6,
                    parts: ["Could not save ", ""],
                    argumentOf: [
                        { construct: false, callee: "showInfoMessage", receiver: "Messages" },
                    ],
                },
                {
                    line: 6,
                    parts: ["Save"],
                    argumentOf: [
                        { construct: false, callee: "showInfoMessage", receiver: "Messages" },
                    ],
                },
            ],
            initializedValues: [{ name: "log", initializer: "Logger.getInstance" }],
        });
    });

    it("read a tree without tsconfig.base.json without resolving aliases", () => {
        rmSync(join(repository.root, "tsconfig.base.json"));

        const bridge = new EngineHostTextSources()
            .readDependencies(repository.root)
            .find(({ path }) => path === "apps/bridge/src/adapter/out/RpcNotifier.ts");

        expect(bridge?.implementedInterfaceFiles).toEqual([]);
    });
});
