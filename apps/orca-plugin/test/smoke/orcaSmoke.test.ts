import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ORCA_SMOKE_AGENT_LABEL, runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { describe, expect, it } from "vitest";

import { withBpmnTask, withDmnDecision } from "../fixtures/agentWrites";
import { BPMN_DELETION, DMN_DELETION } from "../fixtures/smokePoints";
import { fixture } from "../e2e/orcaEditorPage";

const plugin =
    process.env.ORCA_SMOKE_PLUGIN ?? fileURLToPath(new URL("../../plugin", import.meta.url));
const results = fileURLToPath(new URL("../../test-results/orca-smoke", import.meta.url));

const documents = [
    {
        name: "smoke.bpmn",
        deletion: BPMN_DELETION,
        addOutside: (text: string) => withBpmnTask(text, ORCA_SMOKE_AGENT_LABEL),
    },
    {
        name: "smoke.dmn",
        deletion: DMN_DELETION,
        addOutside: (text: string) => withDmnDecision(text, ORCA_SMOKE_AGENT_LABEL),
    },
];

describe("the plugin in a real Orca", () => {
    it.each(documents)(
        "loads, edits, saves and undoes $name",
        async ({ name, deletion, addOutside }) => {
            if (process.platform === "darwin" && !process.env.ORCA_APP) {
                throw new Error(
                    "test:orca would open Orca's window on this Mac: run test:orca:docker instead",
                );
            }
            if (!existsSync(plugin))
                throw new Error(`no built plugin at ${plugin}: run build first`);
            const element = { at: [...deletion.at] as [number, number], label: deletion.label };
            const result = await runOrcaSmoke({
                plugin,
                document: { name, text: fixture(name) },
                deletions: [element, element, element],
                addOutside,
                changeOutside: (text) => text,
                results: `${results}/${name}`,
            });
            expect(result.steps).toEqual([
                "resolve",
                "launch",
                "validate",
                "load",
                "open",
                "themes",
                "undo",
                "edit",
                "external",
                "logs",
                "close",
            ]);
        },
    );
});
