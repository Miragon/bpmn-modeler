import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NodeResolver from "bpmnlint/lib/resolver/node-resolver";

import { DefaultBpmnlintConfigService } from "../../../service/DefaultBpmnlintConfigService";
import { NodeBpmnLinter } from "./NodeBpmnLinter";

const moddlesCreated = vi.hoisted(() => vi.fn());

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
        const resolveRule = vi.spyOn(NodeResolver.prototype, "resolveRule");
        const linter = new NodeBpmnLinter();
        const recommended = { extends: "bpmnlint:recommended" };

        await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, recommended);
        expect(moddlesCreated).toHaveBeenCalledOnce();
        expect(resolveRule).toHaveBeenCalled();

        resolveRule.mockClear();
        const { results } = await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, { ...recommended });
        expect(moddlesCreated).toHaveBeenCalledOnce();
        expect(resolveRule).not.toHaveBeenCalled();
        expect(Object.keys(results)).toContain("start-event-required");

        await linter.lint(BPMN_WITH_TASK, CONFIG_PATH, {
            ...recommended,
            rules: { "label-required": "off" },
        });
        expect(moddlesCreated).toHaveBeenCalledTimes(2);
        expect(resolveRule).toHaveBeenCalled();
    });

    it("picks up a plugin installed after a run that could not resolve it", async () => {
        const linter = new NodeBpmnLinter();
        const configPath = join(workspaceDir, ".bpmnlintrc");
        const config = { rules: { "custom-plugin/task-found": "warn" } };

        const before = await linter.lint(BPMN_WITH_TASK, configPath, config);
        expect(before.unresolved).toEqual(["bpmnlint-plugin-custom-plugin/task-found"]);

        const pluginDir = join(workspaceDir, "node_modules", "bpmnlint-plugin-custom-plugin");
        await mkdir(join(pluginDir, "rules"), { recursive: true });
        await writeFile(
            join(pluginDir, "package.json"),
            JSON.stringify({ name: "bpmnlint-plugin-custom-plugin", version: "1.0.0" }),
        );
        await writeFile(
            join(pluginDir, "rules", "task-found.js"),
            `module.exports = () => ({
                check(node, reporter) {
                    if (node.$type === "bpmn:Task") reporter.report(node.id, "Task found");
                },
            });`,
        );

        const after = await linter.lint(BPMN_WITH_TASK, configPath, config);
        expect(after.unresolved).toEqual([]);
        expect(after.results["custom-plugin/task-found"]).toEqual([
            expect.objectContaining({ id: "Task_1" }),
        ]);
    });
});
