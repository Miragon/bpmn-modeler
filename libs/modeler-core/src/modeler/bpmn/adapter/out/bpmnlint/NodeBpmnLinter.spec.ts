import { createHash } from "node:crypto";
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toWorkspacePath } from "../../../../../kernel/domain/workspacePath";
import { InMemoryPluginApprovals } from "../../../../../testing";
import { FingerprintedRoot } from "../../../domain/packageClosure";
import { InstalledPackagesPort } from "../../../port/installedPackagesPort";
import { DefaultBpmnlintConfigService } from "../../../service/DefaultBpmnlintConfigService";
import { PackageClosureFingerprinter } from "../../../service/PackageClosureFingerprinter";
import { NodeBpmnLinter } from "./NodeBpmnLinter";

const moddlesCreated = vi.hoisted(() => vi.fn());
const bundledRuleResolved = vi.hoisted(() => vi.fn());

vi.mock("@miragon/bpmnlint-plugin-rules", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@miragon/bpmnlint-plugin-rules")>();
    return {
        ...actual,
        createBundledResolver: () => {
            const bundled = actual.createBundledResolver();
            return {
                resolveRule: (pkg: string, ruleName: string) => {
                    bundledRuleResolved();
                    return bundled.resolveRule(pkg, ruleName);
                },
                resolveConfig: (pkg: string, configName: string) =>
                    bundled.resolveConfig(pkg, configName),
            };
        },
    };
});

vi.mock("bpmn-moddle", async (importOriginal) => {
    const actual = await importOriginal<{ BpmnModdle: (...args: unknown[]) => unknown }>();
    const countingFactory = (...args: unknown[]) => {
        moddlesCreated();
        return actual.BpmnModdle(...args);
    };
    return { default: countingFactory, BpmnModdle: countingFactory };
});

// A tmp dir has no `node_modules` up its tree, so the workspace NodeResolver
// misses and resolution falls back to the bundled built-in rules — the same path
// a real workspace without `bpmnlint` installed takes.
const CONFIG_PATH = join(tmpdir(), ".bpmnlintrc");

const BPMN_WITH_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Do the thing" />
  </bpmn:process>
</bpmn:definitions>`;

// A connected C8 service task with no `zeebe:taskDefinition` — a canonical
// deploy-breaker the camunda-compat `implementation` rule flags.
const BPMN_C8_UNIMPLEMENTED_SERVICE_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
<bpmn:startEvent id="Start_1" />
<bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
<bpmn:serviceTask id="Task_1" name="Do the thing" />
<bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
<bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe("NodeBpmnLinter", () => {
    it("resolves built-in rules from the bundled fallback and reports findings", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            CONFIG_PATH,
            { extends: "bpmnlint:recommended" },
        );

        expect(unresolved).toEqual([]);
        // recommended flags the process's missing start event.
        expect(Object.keys(results)).toContain("start-event-required");
    });

    it("skips a custom rule it cannot resolve and records it instead of throwing", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            CONFIG_PATH,
            { rules: { "custom-plugin/no-such-rule": "error" } },
        );

        // bpmnlint normalises the short pkg to its `bpmnlint-plugin-*` name before
        // resolution, which is exactly the package the user must install.
        expect(unresolved).toContain("bpmnlint-plugin-custom-plugin/no-such-rule");
        // The missing rule contributes no findings; nothing else was configured.
        expect(results).toEqual({});
    });

    it("skips an unresolvable plugin config without aborting the lint", async () => {
        const { unresolved } = await new NodeBpmnLinter().lint(BPMN_WITH_TASK, CONFIG_PATH, {
            extends: ["bpmnlint:recommended", "plugin:custom-plugin/recommended"],
        });

        expect(unresolved).toContain("plugin:bpmnlint-plugin-custom-plugin/recommended");
    });

    it("lints against the bundled default and fires a camunda-compat C8 rule with everything resolved", async () => {
        const config = await new DefaultBpmnlintConfigService().build("c8");

        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_C8_UNIMPLEMENTED_SERVICE_TASK,
            CONFIG_PATH,
            config,
        );

        expect(unresolved).toEqual([]);
        expect(Object.keys(results)).toContain("camunda-compat/implementation");
    });

    // A label on an unconditional flow duplicates what the diagram already says —
    // bpmnlint 11.14.0's `superfluous-label` (recommended) flags it.
    const BPMN_LABELED_UNCONDITIONAL_FLOW = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_1" name="then" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:task id="Task_1" name="Do the thing" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    // Labels that carry meaning: a conditional flow, a gateway's default flow, and
    // a fork out of an exclusive gateway — the rule's upstream exceptions.
    const BPMN_MEANINGFUL_FLOW_LABELS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_In" sourceRef="Start_1" targetRef="Gateway_1" />
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_Default">
      <bpmn:outgoing>Flow_Conditional</bpmn:outgoing>
      <bpmn:outgoing>Flow_Fork</bpmn:outgoing>
      <bpmn:outgoing>Flow_Default</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_Conditional" name="yes" sourceRef="Gateway_1" targetRef="Task_1">
      <bpmn:conditionExpression>approved</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Fork" name="maybe" sourceRef="Gateway_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_Default" name="no" sourceRef="Gateway_1" targetRef="Task_3" />
    <bpmn:task id="Task_1" name="Approve" />
    <bpmn:task id="Task_2" name="Review" />
    <bpmn:task id="Task_3" name="Reject" />
    <bpmn:sequenceFlow id="Flow_End_1" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_End_2" sourceRef="Task_2" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_End_3" sourceRef="Task_3" targetRef="End_1" />
    <bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    it("reports a labeled unconditional sequence flow via the bundled superfluous-label rule", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_LABELED_UNCONDITIONAL_FLOW,
            CONFIG_PATH,
            { extends: "bpmnlint:recommended" },
        );

        expect(unresolved).toEqual([]);
        expect(results["superfluous-label"]).toEqual([expect.objectContaining({ id: "Flow_1" })]);
    });

    it("keeps conditional, default, and gateway-fork labels exempt from superfluous-label", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_MEANINGFUL_FLOW_LABELS,
            CONFIG_PATH,
            { extends: "bpmnlint:recommended" },
        );

        expect(unresolved).toEqual([]);
        expect(results["superfluous-label"]).toBeUndefined();
    });

    it("reports base bpmnlint:recommended findings under the bundled default", async () => {
        const config = await new DefaultBpmnlintConfigService().build(undefined);

        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            CONFIG_PATH,
            config,
        );

        expect(unresolved).toEqual([]);
        expect(Object.keys(results)).toContain("start-event-required");
    });
});

describe("NodeBpmnLinter across runs", () => {
    const BPMN_TWO_FLOWS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:task id="Task_1" name="Do the thing" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    let workspaceDir: string;

    beforeEach(async () => {
        moddlesCreated.mockClear();
        bundledRuleResolved.mockClear();
        workspaceDir = await mkdtemp(join(tmpdir(), "node-bpmn-linter-"));
    });

    afterEach(async () => {
        vi.restoreAllMocks();
        await rm(workspaceDir, { recursive: true, force: true });
    });

    it("starts every run with fresh rule state", async () => {
        const linter = new NodeBpmnLinter();
        const config = { rules: { "no-duplicate-sequence-flows": "error" } };

        const first = await linter.lint(BPMN_TWO_FLOWS, CONFIG_PATH, config);
        const second = await linter.lint(BPMN_TWO_FLOWS, CONFIG_PATH, config);

        expect(first.results).toEqual({});
        expect(second.results).toEqual({});
    });

    it("reports the same unresolved rules on every run", async () => {
        const linter = new NodeBpmnLinter();
        const config = {
            rules: { "custom-plugin/no-such-rule": "error" },
            moddleExtensions: { custom: "no-such-moddle-extension" },
        };

        const first = await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, config);
        const second = await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, config);

        expect(first.unresolved).toEqual([
            "moddleExtension:custom",
            "bpmnlint-plugin-custom-plugin/no-such-rule",
        ]);
        expect(second.unresolved).toEqual(first.unresolved);
    });

    it("reuses the moddle and resolved rules until the config changes", async () => {
        const linter = new NodeBpmnLinter();
        const recommended = { extends: "bpmnlint:recommended" };

        await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, recommended);
        expect(moddlesCreated).toHaveBeenCalledOnce();
        expect(bundledRuleResolved).toHaveBeenCalled();

        bundledRuleResolved.mockClear();
        const { results } = await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, { ...recommended });
        expect(moddlesCreated).toHaveBeenCalledOnce();
        expect(bundledRuleResolved).not.toHaveBeenCalled();
        expect(Object.keys(results)).toContain("start-event-required");

        await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, {
            ...recommended,
            rules: { "label-required": "off" },
        });
        expect(moddlesCreated).toHaveBeenCalledTimes(2);
        expect(bundledRuleResolved).toHaveBeenCalled();
    });

    it("runs no workspace rule package when no gate is wired", async () => {
        const RAN = "__bpmnlintUngatedPluginRan";
        const pluginDir = join(workspaceDir, "node_modules", "bpmnlint-plugin-custom-plugin");
        await mkdir(join(pluginDir, "rules"), { recursive: true });
        await writeFile(
            join(pluginDir, "package.json"),
            JSON.stringify({ name: "bpmnlint-plugin-custom-plugin", version: "1.0.0" }),
        );
        await writeFile(
            join(pluginDir, "rules", "task-found.js"),
            `globalThis.${RAN} = true;\nmodule.exports = () => ({ check() {} });`,
        );

        const { unresolved, blocked } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            join(workspaceDir, ".bpmnlintrc"),
            { rules: { "custom-plugin/task-found": "warn" } },
        );

        expect((globalThis as Record<string, unknown>)[RAN]).toBeUndefined();
        expect(unresolved).toEqual(["bpmnlint-plugin-custom-plugin/task-found"]);
        expect(blocked).toEqual([]);
    });
});

describe("NodeBpmnLinter and workspace code outside rule packages", () => {
    const RAN = "__bpmnlintWorkspaceCodeRan";
    const markerScript = (exported: string) =>
        `globalThis.${RAN} = (globalThis.${RAN} ?? 0) + 1;\nmodule.exports = ${exported};`;

    let workspaceDir: string;

    beforeEach(async () => {
        workspaceDir = await mkdtemp(join(tmpdir(), "node-bpmn-linter-workspace-"));
        delete (globalThis as Record<string, unknown>)[RAN];
    });

    afterEach(async () => {
        delete (globalThis as Record<string, unknown>)[RAN];
        await rm(workspaceDir, { recursive: true, force: true });
    });

    async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
        const path = join(workspaceDir, ...relativePath.split("/"));
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, content);
    }

    const workspaceCodeRan = () => (globalThis as Record<string, unknown>)[RAN] !== undefined;

    // bpmnlint's NodeResolver loads the core's own rules and configs relative to
    // the module that requires them; scoped to the config folder, that is two
    // folders above the `.bpmnlintrc`.
    it.each([
        {
            what: "a built-in rule",
            file: "rules/label-required.js",
            config: { rules: { "label-required": "error" } },
        },
        {
            what: "a built-in config",
            file: "config/recommended.js",
            config: { extends: "bpmnlint:recommended" },
        },
    ])("never runs a script two folders above the config for $what", async ({ file, config }) => {
        await writeWorkspaceFile(file, markerScript("() => ({ check() {} })"));
        await writeWorkspaceFile("a/b/.bpmnlintrc", JSON.stringify(config));

        const { unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            join(workspaceDir, "a", "b", ".bpmnlintrc"),
            config,
        );

        expect(workspaceCodeRan()).toBe(false);
        expect(unresolved).toEqual([]);
    });

    it("takes bpmnlint's own rules from the bundle, never from the workspace's install", async () => {
        await writeWorkspaceFile(
            "node_modules/bpmnlint/package.json",
            JSON.stringify({ name: "bpmnlint", version: "11.0.0", main: "index.js" }),
        );
        await writeWorkspaceFile(
            "node_modules/bpmnlint/index.js",
            markerScript("{ configs: { recommended: { rules: {} } } }"),
        );

        const { results } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            join(workspaceDir, ".bpmnlintrc"),
            { extends: "bpmnlint:recommended" },
        );

        expect(workspaceCodeRan()).toBe(false);
        expect(Object.keys(results)).toContain("start-event-required");
    });

    it("skips a moddle extension that is a script and reports it", async () => {
        await writeWorkspaceFile(
            "acme.js",
            markerScript(`{ name: "Acme", prefix: "acme", uri: "http://acme", types: [] }`),
        );

        const { unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            join(workspaceDir, ".bpmnlintrc"),
            { moddleExtensions: { acme: "./acme.js" } },
        );

        expect(workspaceCodeRan()).toBe(false);
        expect(unresolved).toEqual(["moddleExtension:acme"]);
    });

    it("skips a moddle extension named .JSON, which Node runs as a script", async () => {
        await writeWorkspaceFile(
            "acme.JSON",
            markerScript(`{ name: "Acme", prefix: "acme", uri: "http://acme", types: [] }`),
        );

        const { unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            join(workspaceDir, ".bpmnlintrc"),
            { moddleExtensions: { acme: "./acme.JSON" } },
        );

        expect(workspaceCodeRan()).toBe(false);
        expect(unresolved).toEqual(["moddleExtension:acme"]);
    });

    it.each(["./acme.json", "./acme"])(
        "loads a moddle extension from a JSON descriptor named %s",
        async (reference) => {
            await writeWorkspaceFile(
                "acme.json",
                JSON.stringify({ name: "Acme", prefix: "acme", uri: "http://acme", types: [] }),
            );

            const { unresolved } = await new NodeBpmnLinter().lint(
                BPMN_WITH_TASK,
                join(workspaceDir, ".bpmnlintrc"),
                { moddleExtensions: { acme: reference } },
            );

            expect(unresolved).toEqual([]);
        },
    );
});

describe("NodeBpmnLinter with workspace rule packages", () => {
    const RAN = "__bpmnlintRulePackageCodeRan";
    const ran = () => ((globalThis as Record<string, unknown>)[RAN] ?? []) as string[];
    const marked = (label: string, body: string) =>
        `(globalThis.${RAN} ??= []).push(${JSON.stringify(label)});\n${body}`;

    const orUndefined = <T>(read: () => T): T | undefined => {
        try {
            return read();
        } catch {
            return undefined;
        }
    };
    const kindOf = (entry: { isDirectory(): boolean; isFile(): boolean }) => {
        if (entry.isDirectory()) {
            return "directory" as const;
        }
        return entry.isFile() ? ("file" as const) : ("other" as const);
    };
    const nodePackages: InstalledPackagesPort = {
        realPath: (path) => orUndefined(() => toWorkspacePath(realpathSync(path))),
        listDirectory: (path) =>
            orUndefined(() =>
                readdirSync(path, { withFileTypes: true }).map((entry) => ({
                    name: entry.name,
                    kind: entry.isSymbolicLink() ? "symbolicLink" : kindOf(entry),
                })),
            ),
        stamp: (path) => {
            const stats = orUndefined(() => statSync(path, { bigint: true }));
            return (
                stats && {
                    kind: kindOf(stats),
                    dev: stats.dev,
                    ino: stats.ino,
                    size: stats.size,
                    mtimeNs: stats.mtimeNs,
                    ctimeNs: stats.ctimeNs,
                }
            );
        },
        sha256OfFile: (path) =>
            orUndefined(() => createHash("sha256").update(readFileSync(path)).digest("hex")),
        sha256OfText: (text) => createHash("sha256").update(text, "utf8").digest("hex"),
        readTextFile: (path) => orUndefined(() => readFileSync(path, "utf8")),
    };

    let workspaceDir: string;
    let configPath: string;
    let approvals: InMemoryPluginApprovals;
    let fingerprints: PackageClosureFingerprinter;
    let linter: NodeBpmnLinter;

    const acmeDir = () => join(workspaceDir, "node_modules", "bpmnlint-plugin-acme");
    const TASK_FOUND = { rules: { "acme/task-found": "warn" } };

    async function writeWorkspaceFile(relativePath: string, content: string): Promise<void> {
        const path = join(workspaceDir, ...relativePath.split("/"));
        await mkdir(join(path, ".."), { recursive: true });
        await writeFile(path, content);
    }

    async function installPackage(
        folder: string,
        manifest: Record<string, unknown>,
        files: Record<string, string>,
    ): Promise<void> {
        await writeWorkspaceFile(
            `${folder}/package.json`,
            JSON.stringify({ version: "1.0.0", ...manifest }),
        );
        for (const [relPath, content] of Object.entries(files)) {
            await writeWorkspaceFile(`${folder}/${relPath}`, content);
        }
    }

    /** bpmnlint-plugin-acme reports every task with the text its dependency acme-dep exports. */
    async function installAcme(message = "v1"): Promise<void> {
        await installPackage(
            "node_modules/bpmnlint-plugin-acme",
            { name: "bpmnlint-plugin-acme", dependencies: { "acme-dep": "1.0.0" } },
            {
                "index.js": marked("acme", "module.exports = {};"),
                "rules/task-found.js": marked(
                    "acme/task-found",
                    `const message = require("acme-dep");
module.exports = () => ({
    check(node, reporter) {
        if (node.$type === "bpmn:Task") reporter.report(node.id, message);
    },
});`,
                ),
            },
        );
        await writeAcmeDep(message);
    }

    async function writeAcmeDep(message: string): Promise<void> {
        await installPackage(
            "node_modules/acme-dep",
            { name: "acme-dep" },
            { "index.js": marked("acme-dep", `module.exports = ${JSON.stringify(message)};`) },
        );
    }

    function approve(root: FingerprintedRoot): void {
        const fingerprint = fingerprints.fingerprint(root);
        if (fingerprint.kind !== "fingerprinted") {
            throw new Error(`refused: ${fingerprint.reason}`);
        }
        approvals.approvals = [
            ...approvals.approvals.filter(({ pluginId }) => pluginId !== root.id),
            { pluginId: root.id, contentHash: fingerprint.rulePackage.contentHash },
        ];
    }

    const approveAcme = () => approve({ kind: "package", id: acmeDir() });

    beforeEach(async () => {
        workspaceDir = toWorkspacePath(
            realpathSync(await mkdtemp(join(tmpdir(), "node-bpmn-linter-gate-"))),
        );
        configPath = join(workspaceDir, ".bpmnlintrc");
        approvals = new InMemoryPluginApprovals();
        fingerprints = new PackageClosureFingerprinter(nodePackages);
        linter = new NodeBpmnLinter({ approvals, fingerprints, packages: nodePackages });
        delete (globalThis as Record<string, unknown>)[RAN];
    });

    afterEach(async () => {
        delete (globalThis as Record<string, unknown>)[RAN];
        await rm(workspaceDir, { recursive: true, force: true });
    });

    it("never runs a package nobody allowed and reports it as new and needed", async () => {
        await installAcme();

        const { results, unresolved, blocked } = await linter.lint(
            BPMN_WITH_TASK,
            configPath,
            TASK_FOUND,
        );

        expect(ran()).toEqual([]);
        expect(results).toEqual({});
        expect(unresolved).toEqual(["bpmnlint-plugin-acme/task-found"]);
        expect(blocked).toEqual([{ id: acmeDir(), state: "new", needed: true }]);
    });

    it("runs an allowed package with the dependency it declares", async () => {
        await installAcme();
        approveAcme();

        const { results, unresolved, blocked } = await linter.lint(
            BPMN_WITH_TASK,
            configPath,
            TASK_FOUND,
        );

        expect(ran()).toEqual(["acme", "acme/task-found", "acme-dep"]);
        expect(results["acme/task-found"]).toEqual([
            expect.objectContaining({ id: "Task_1", message: "v1" }),
        ]);
        expect(unresolved).toEqual([]);
        expect(blocked).toEqual([]);
    });

    it("lints with a package allowed after a run, with no config change", async () => {
        await installAcme();
        await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        approveAcme();
        const { results, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        expect(results["acme/task-found"]).toEqual([expect.objectContaining({ id: "Task_1" })]);
        expect(blocked).toEqual([]);
    });

    it("picks up a package installed and allowed after a run that could not resolve it", async () => {
        const before = await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        await installAcme();
        approveAcme();
        const after = await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        expect(before.blocked).toEqual([]);
        expect(after.unresolved).toEqual([]);
        expect(after.results["acme/task-found"]).toEqual([
            expect.objectContaining({ id: "Task_1" }),
        ]);
    });

    it("stops using a dependency edited after approval, though every rule came from the cache", async () => {
        await installAcme();
        approveAcme();
        await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);
        const cachedRun = await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        await writeAcmeDep("v2, edited after the approval");
        const { results, unresolved, blocked } = await linter.lint(
            BPMN_WITH_TASK,
            configPath,
            TASK_FOUND,
        );

        expect(cachedRun.results["acme/task-found"]).toHaveLength(1);
        expect(results).toEqual({});
        expect(unresolved).toEqual(["bpmnlint-plugin-acme/task-found"]);
        expect(blocked).toEqual([{ id: acmeDir(), state: "changed", needed: true }]);
    });

    it("runs the new bytes once a changed package is allowed again", async () => {
        await installAcme();
        approveAcme();
        await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);
        await writeAcmeDep("v2, edited after the approval");
        await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        approveAcme();
        const { results, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, TASK_FOUND);

        expect(results["acme/task-found"]).toEqual([
            expect.objectContaining({ message: "v2, edited after the approval" }),
        ]);
        expect(blocked).toEqual([]);
    });

    it("never runs the config folder's own package without approval", async () => {
        await installPackage(
            ".",
            { name: "bpmnlint-plugin-self" },
            {
                "index.js": marked(
                    "self",
                    "module.exports = { configs: { recommended: { rules: {} } } };",
                ),
            },
        );

        const { unresolved, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, {
            extends: "plugin:self/recommended",
        });

        expect(ran()).toEqual([]);
        expect(unresolved).toEqual(["plugin:bpmnlint-plugin-self/recommended"]);
        expect(blocked).toEqual([{ id: workspaceDir, state: "new", needed: true }]);
    });

    it("refuses an absolute rule reference to a workspace file outside node_modules and never offers it", async () => {
        const evilPath = join(workspaceDir, "scripts", "evil.js");
        await writeWorkspaceFile("scripts/evil.js", marked("evil", "module.exports = () => ({});"));
        await installPackage(
            "node_modules/bpmnlint-plugin-pointer",
            { name: "bpmnlint-plugin-pointer" },
            {
                "index.js": marked(
                    "pointer",
                    `module.exports = { rules: { evil: ${JSON.stringify(evilPath)} } };`,
                ),
            },
        );
        approve({ kind: "package", id: join(workspaceDir, "node_modules/bpmnlint-plugin-pointer") });

        const { unresolved, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, {
            rules: { "pointer/evil": "error" },
        });

        expect(ran()).toEqual(["pointer"]);
        expect(unresolved).toEqual(["bpmnlint-plugin-pointer/evil"]);
        expect(blocked).toEqual([]);
    });

    it("never runs a file under an allowed package's .git, which its hash leaves out", async () => {
        await installPackage(
            "node_modules/bpmnlint-plugin-acme",
            { name: "bpmnlint-plugin-acme" },
            {
                "index.js": marked(
                    "acme",
                    `module.exports = { rules: { evil: "./.git/evil.js" } };`,
                ),
                ".git/evil.js": marked("evil v1", "module.exports = () => ({ check() {} });"),
            },
        );
        approveAcme();
        await writeWorkspaceFile(
            "node_modules/bpmnlint-plugin-acme/.git/evil.js",
            marked("evil v2, written after the approval", "module.exports = () => ({ check() {} });"),
        );

        const { unresolved, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, {
            rules: { "acme/evil": "error" },
        });

        expect(ran()).toEqual(["acme"]);
        expect(unresolved).toEqual(["bpmnlint-plugin-acme/evil"]);
        expect(blocked).toEqual([]);
    });

    it("never runs a model file of the allowed config folder's own package, which its hash leaves out", async () => {
        await installPackage(
            ".",
            { name: "bpmnlint-plugin-self" },
            {
                "index.js": marked("self", `module.exports = { rules: { evil: "./evil.bpmn" } };`),
                "evil.bpmn": marked("evil v1", "module.exports = () => ({ check() {} });"),
            },
        );
        approve({ kind: "selfPackage", id: workspaceDir });
        await writeWorkspaceFile(
            "evil.bpmn",
            marked("evil v2, written after the approval", "module.exports = () => ({ check() {} });"),
        );

        const { unresolved, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, {
            rules: { "self/evil": "error" },
        });

        expect(ran()).toEqual(["self"]);
        expect(unresolved).toEqual(["bpmnlint-plugin-self/evil"]);
        expect(blocked).toEqual([]);
    });

    describe("a workspace camunda-compat nobody allowed", () => {
        const camundaCompatDir = () =>
            join(workspaceDir, "node_modules", "bpmnlint-plugin-camunda-compat");

        beforeEach(async () => {
            await installPackage(
                "node_modules/bpmnlint-plugin-camunda-compat",
                { name: "bpmnlint-plugin-camunda-compat" },
                {
                    "index.js": marked(
                        "camunda-compat",
                        `module.exports = { configs: { "camunda-cloud-8-10": { rules: {} } } };`,
                    ),
                    "rules/workspace-only.js": marked(
                        "camunda-compat/workspace-only",
                        "module.exports = () => ({ check() {} });",
                    ),
                },
            );
        });

        it("lints with the bundled copy where it serves the config, without needing the workspace one", async () => {
            const config = await new DefaultBpmnlintConfigService().build("c8");

            const { results, unresolved, blocked } = await linter.lint(
                BPMN_C8_UNIMPLEMENTED_SERVICE_TASK,
                configPath,
                config,
            );

            expect(ran()).toEqual([]);
            expect(unresolved).toEqual([]);
            expect(Object.keys(results)).toContain("camunda-compat/implementation");
            expect(blocked).toEqual([{ id: camundaCompatDir(), state: "new", needed: false }]);
        });

        it("needs the workspace copy for a rule only it has", async () => {
            const { unresolved, blocked } = await linter.lint(BPMN_WITH_TASK, configPath, {
                rules: { "camunda-compat/workspace-only": "error" },
            });

            expect(ran()).toEqual([]);
            expect(unresolved).toEqual(["bpmnlint-plugin-camunda-compat/workspace-only"]);
            expect(blocked).toEqual([{ id: camundaCompatDir(), state: "new", needed: true }]);
        });
    });
});
