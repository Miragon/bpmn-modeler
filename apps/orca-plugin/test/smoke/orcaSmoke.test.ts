import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runOrcaSmoke } from "@miragon/modeler-shell/testing/orca-electron";
import { describe, it } from "vitest";

import { fixture } from "../e2e/orcaEditorPage";

const plugin =
    process.env.ORCA_SMOKE_PLUGIN ?? fileURLToPath(new URL("../../plugin", import.meta.url));
const results = fileURLToPath(new URL("../../test-results/orca-smoke", import.meta.url));

describe("the plugin in a real Orca", () => {
    it.each(["smoke.bpmn", "smoke.dmn"])("loads and shows %s", async (name) => {
        if (process.platform === "darwin" && !process.env.ORCA_APP) {
            throw new Error(
                "test:orca would open Orca's window on this Mac: run test:orca:docker instead",
            );
        }
        if (!existsSync(plugin)) throw new Error(`no built plugin at ${plugin}: run build first`);
        await runOrcaSmoke({
            plugin,
            document: { name, text: fixture(name) },
            results: `${results}/${name}`,
        });
    });
});
