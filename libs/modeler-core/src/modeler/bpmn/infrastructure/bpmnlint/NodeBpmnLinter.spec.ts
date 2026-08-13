import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { NodeBpmnLinter } from "./NodeBpmnLinter";

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
});
