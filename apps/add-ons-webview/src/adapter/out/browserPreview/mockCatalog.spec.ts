import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The view cannot import the core, so the copied texts are compared as source.
const CORE_ADD_ONS_DOMAIN = join(__dirname, "../../../../../../libs/modeler-core/src/addOns/domain");

function sourcesIn(dir: string): string {
    return readdirSync(dir)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
        .map((file) => readFileSync(join(dir, file), "utf8"))
        .join("\n");
}

function pairsOf(source: string, pattern: RegExp): [string, string][] {
    return [...source.matchAll(pattern)].map(([, key, text]) => [key, text]);
}

describe("the preview catalog's texts", () => {
    const core = sourcesIn(CORE_ADD_ONS_DOMAIN);
    // The catalog's rows and the requests that change them live in separate preview modules.
    const preview = sourcesIn(__dirname);

    it("refuses with the text the core refuses with for the same reason", () => {
        const coreRefusals = pairsOf(core, /refused\(\s*"(\w+)",\s*"([^"]*)"/g);
        const mockRefusals = pairsOf(preview, /reason:\s*"(\w+)",\s*message:\s*"([^"]*)"/g);

        expect(mockRefusals).not.toEqual([]);
        expect(
            mockRefusals.filter(
                ([reason, text]) => !coreRefusals.some(([coreReason, coreText]) => coreReason === reason && coreText === text),
            ),
        ).toEqual([]);
    });

    it("labels each action as the core labels it", () => {
        const labelBlock = /ACTION_LABEL = \{([^}]*)\}/.exec(core)?.[1] ?? "";
        const coreLabels = new Map(pairsOf(labelBlock, /(\w+):\s*"([^"]*)"/g));
        const mockActions = pairsOf(preview, /kind:\s*"(\w+)",\s*label:\s*"([^"]*)"/g).filter(([kind]) =>
            coreLabels.has(kind),
        );

        expect(mockActions).not.toEqual([]);
        expect(mockActions.filter(([kind, label]) => coreLabels.get(kind) !== label)).toEqual([]);
    });
});
