import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TempGitRepository } from "../../fitness/__fixtures__/tempGitRepository";
import { functionReport } from "../../fitness/domain/report";
import { measure } from "../../fitness/service/measurement";
import { EngineHostTextSources } from "../adapter/out/engineHostTextSources";
import { createHostTextFitnessFunction } from "./hostTextFitnessFunction";

const CONTROLLER = "x/controller/FakeController.ts";

let repository: TempGitRepository;

beforeEach(() => {
    repository = new TempGitRepository();
});

afterEach(() => {
    repository.remove();
});

const hostText = createHostTextFitnessFunction({ sources: new EngineHostTextSources() });

function commitFiles(files: Readonly<Record<string, string>>): void {
    for (const [path, content] of Object.entries(files)) {
        repository.write(path, content);
    }
    repository.git("add", "--all");
    repository.git("commit", "--quiet", "-m", "fixture");
}

function measureTree(commit: string) {
    return measure(hostText, { repoRoot: repository.root, commit, changeBase: commit });
}

function findingsOf(files: Readonly<Record<string, string>>) {
    commitFiles(files);
    const measurement = measureTree("head");
    return "findings" in measurement ? measurement.findings : [];
}

function controller(...body: string[]): string {
    return [
        'import { window } from "vscode";',
        "",
        "export class FakeController {",
        "    constructor(private readonly logger: { info(message: string): void }) {}",
        "",
        "    async ask(host: string): Promise<void> {",
        ...body.map((line) => `        ${line}`),
        "    }",
        "}",
    ].join("\n");
}

describe("the host text fitness function on a hand-built tree", () => {
    it("reports the title a template builds in a file that imports vscode, at its path and line", () => {
        expect(
            findingsOf({
                [CONTROLLER]: controller(
                    "await window.showInputBox({ title: `Token for ${host}` });",
                ),
            }),
        ).toEqual([
            {
                key: `${CONTROLLER} — Token for \${…}`,
                path: CONTROLLER,
                line: 7,
                message: "`Token for ${…}`",
            },
        ]);
    });

    it("does not read the same text logged through logger.info", () => {
        expect(
            findingsOf({ [CONTROLLER]: controller("this.logger.info(`Token for ${host}`);") }),
        ).toEqual([]);
    });

    it("does not read a union of literal types", () => {
        expect(findingsOf({ [CONTROLLER]: `${controller()}\n\ntype T = "a b" | "c";\n` })).toEqual(
            [],
        );
    });

    it("does not read the same text in a file that does not import vscode", () => {
        expect(
            findingsOf({
                "x/service/tokenTitle.ts":
                    "export const tokenTitle = (host: string) => `Token for ${host}`;",
            }),
        ).toEqual([]);
    });

    it("reads a bridge adapter that implements a core interface without importing vscode", () => {
        expect(
            findingsOf({
                "tsconfig.base.json": JSON.stringify({
                    compilerOptions: {
                        paths: {
                            "@miragon/bpmn-modeler-core": ["./libs/modeler-core/src/index.ts"],
                        },
                    },
                }),
                "libs/modeler-core/src/index.ts":
                    'export type { NotifierPort } from "./kernel/port/hostPorts";',
                "libs/modeler-core/src/kernel/port/hostPorts.ts":
                    "export interface NotifierPort { showInfo(text: string): void }",
                "apps/modeler-bridge/src/kernel/adapter/out/RpcNotifier.ts": [
                    'import type { NotifierPort } from "@miragon/bpmn-modeler-core";',
                    "export class RpcNotifier implements NotifierPort {",
                    "    showInfo(text: string): void {",
                    '        send(text || "Nothing to show");',
                    "    }",
                    "}",
                ].join("\n"),
            }),
        ).toEqual([
            expect.objectContaining({
                path: "apps/modeler-bridge/src/kernel/adapter/out/RpcNotifier.ts",
                line: 4,
                message: "`Nothing to show`",
            }),
        ]);
    });

    it("marks an error message a branch adds to a host file as new, and an old text as existing", () => {
        commitFiles({ [CONTROLLER]: controller('window.showInformationMessage("Token saved");') });
        const base = measureTree("base");

        commitFiles({
            [CONTROLLER]: controller(
                'window.showErrorMessage("Could not save");',
                'window.showInformationMessage("Token saved");',
            ),
        });
        const report = functionReport(hostText, measureTree("head"), {
            source: "checkout",
            measurement: base,
        });

        expect(report.outcome).toEqual({
            kind: "measured",
            findings: [
                expect.objectContaining({ line: 7, message: "`Could not save`", status: "new" }),
                expect.objectContaining({ line: 8, message: "`Token saved`", status: "existing" }),
            ],
            resolved: [],
        });
    });
});
