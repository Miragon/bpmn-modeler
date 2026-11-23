import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The view cannot import the core, so the copied texts are compared as source.
const CORE = join(__dirname, "../../../../../../libs/modeler-core/src");
const CORE_ADD_ONS_DOMAIN = join(CORE, "addOns/domain");
const CODE_FOLLOW_UP_SOURCES = [
    "bpmnPlugins/domain/pluginApproval.ts",
    "modeler/bpmn/domain/rulePackageApproval.ts",
    "kernel/domain/approvableCodeTexts.ts",
];

function sourcesIn(dir: string): string {
    return readdirSync(dir)
        .filter((file) => file.endsWith(".ts") && !file.endsWith(".spec.ts"))
        .map((file) => readFileSync(join(dir, file), "utf8"))
        .join("\n");
}

function pairsOf(source: string, pattern: RegExp): [string, string][] {
    return [...source.matchAll(pattern)].map(([, key, text]) => [key, text]);
}

function textsOf(source: string, pattern: RegExp): string[] {
    return [...source.matchAll(pattern)].map(([, text]) => text);
}

function groupsOf(source: string, pattern: RegExp): string[] {
    const match = pattern.exec(source);
    if (match === null) {
        throw new Error(`Nothing matches ${pattern}`);
    }
    return match.slice(1);
}

function textOf(source: string, pattern: RegExp): string {
    return groupsOf(source, pattern)[0];
}

describe("the preview catalog's texts", () => {
    const core = sourcesIn(CORE_ADD_ONS_DOMAIN);
    // The catalog's rows and the requests that change them live in separate preview modules.
    const preview = sourcesIn(__dirname);
    const codeFollowUps = CODE_FOLLOW_UP_SOURCES.map((file) =>
        readFileSync(join(CORE, file), "utf8"),
    ).join("\n");

    it("refuses with the text the core refuses with for the same reason", () => {
        const coreRefusals = pairsOf(core, /refused\(\s*"(\w+)",\s*"([^"]*)"/g);
        const mockRefusals = pairsOf(preview, /reason:\s*"(\w+)",\s*message:\s*"([^"]*)"/g);

        expect(mockRefusals).not.toEqual([]);
        expect(
            mockRefusals.filter(
                ([reason, text]) =>
                    !coreRefusals.some(
                        ([coreReason, coreText]) => coreReason === reason && coreText === text,
                    ),
            ),
        ).toEqual([]);
    });

    it("labels each action as the core labels it", () => {
        const labelBlock = /ACTION_LABEL = \{([^}]*)\}/.exec(core)?.[1] ?? "";
        const coreLabels = new Map(pairsOf(labelBlock, /(\w+):\s*"([^"]*)"/g));
        const mockActions = pairsOf(preview, /kind:\s*"(\w+)",\s*label:\s*"([^"]*)"/g).filter(
            ([kind]) => coreLabels.has(kind),
        );

        expect(mockActions).not.toEqual([]);
        expect(mockActions.filter(([kind, label]) => coreLabels.get(kind) !== label)).toEqual([]);
    });

    it("follows an allow or a revoke with the core's texts", () => {
        const followUpBlock = textOf(preview, /const FOLLOW_UP\b[^=]*=\s*\{([\s\S]*?)\n\};/);
        const literalFollowUps = textsOf(followUpBlock, /(?:allowed|revoked):\s*"([^"]*)"/g);
        const [beforeRestart, afterRestart] = groupsOf(
            codeFollowUps,
            /revokedFollowUp: \(restart\) =>\s*`([^`$]*)\$\{PROCESS_RESTART_TEXT\[restart\]\}([^`]*)`/,
        );
        const reloadWindow = textOf(codeFollowUps, /reloadWindow:\s*"([^"]*)"/);

        expect(literalFollowUps).not.toEqual([]);
        expect(literalFollowUps.filter((text) => !codeFollowUps.includes(`"${text}"`))).toEqual([]);
        expect(textOf(preview, /STILL_LOADED_NOTE = "([^"]*)"/)).toBe(
            `${beforeRestart}${reloadWindow}${afterRestart}`,
        );
        expect(textOf(preview, /IN_REPOSITORY = "([^"]*)"/)).toBe(
            textOf(core, /SCOPE_TEXT\b[^=]*=\s*\{[^}]*repository:\s*"([^"]*)"/),
        );
    });

    it("writes a disabled source's note and each literal state text as the core does", () => {
        const literalStateTexts = textsOf(preview, /stateText:\s*"([^"]*)"/g);

        expect(textOf(preview, /SOURCE_DISABLED_NOTE = "([^"]*)"/)).toBe(
            textOf(core, /TEMPLATE_SOURCE_DISABLED_NOTE = "([^"]*)"/),
        );
        expect(literalStateTexts).not.toEqual([]);
        expect(literalStateTexts.filter((text) => !core.includes(`"${text}"`))).toEqual([]);
    });
});
