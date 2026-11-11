import { describe, expect, it } from "vitest";

import { installedPackageNameOf } from "../../../kernel/domain/installedPackagePath";
import { BlockedRulePackage } from "./rulePackageApproval";
import {
    neededRulePackageLogLines,
    refusedRuleModuleLogLine,
    shadowedRulePackageLogLine,
} from "./rulePackageLog";
import { RefusedRuleModule } from "./rulePackageRefusal";

const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const OTHER = "/work/node_modules/@scope/bpmnlint-plugin-other";

const blocked = (
    id: string,
    needed: boolean,
    state: BlockedRulePackage["state"] = "new",
): BlockedRulePackage => ({
    id,
    name: installedPackageNameOf(id),
    version: "1.0.0",
    allowance: { kind: "rulePackage", host: "", origin: { kind: "folder", path: id }, addOn: "" },
    kind: "package",
    state,
    needed,
});

describe("neededRulePackageLogLines", () => {
    it.each<{ case: string; blocked: BlockedRulePackage[]; lines: string[] }>([
        {
            case: "a new package whose rules were skipped",
            blocked: [blocked(ACME, true)],
            lines: [
                `bpmnlint: rule package bpmnlint-plugin-acme@1.0.0 (${ACME}) is not allowed yet (new), so rules from it are skipped.`,
            ],
        },
        {
            case: "a package declined this session",
            blocked: [blocked(ACME, true, "declined")],
            lines: [
                `bpmnlint: rule package bpmnlint-plugin-acme@1.0.0 (${ACME}) is not allowed yet (declined this session), so rules from it are skipped.`,
            ],
        },
        {
            case: "a package without a version by its name alone",
            blocked: [{ ...blocked(ACME, true), version: "" }],
            lines: [
                `bpmnlint: rule package bpmnlint-plugin-acme (${ACME}) is not allowed yet (new), so rules from it are skipped.`,
            ],
        },
        {
            case: "one line per package, and none for a package the bundle stood in for",
            blocked: [blocked(OTHER, true), blocked(ACME, false), blocked(OTHER, true)],
            lines: [
                `bpmnlint: rule package @scope/bpmnlint-plugin-other@1.0.0 (${OTHER}) is not allowed yet (new), so rules from it are skipped.`,
            ],
        },
    ])("logs $case", ({ blocked: given, lines }) => {
        expect(neededRulePackageLogLines(given)).toEqual(lines);
    });
});

describe("shadowedRulePackageLogLine", () => {
    it.each<{ case: string; blocked: BlockedRulePackage[]; line: string | undefined }>([
        { case: "nothing without a package the bundle stood in for", blocked: [], line: undefined },
        {
            case: "nothing for a package whose rules were skipped",
            blocked: [blocked(ACME, true)],
            line: undefined,
        },
        {
            case: "one package the bundle stood in for",
            blocked: [blocked(ACME, false)],
            line: `bpmnlint: bundled rules stand in for a rule package that is not allowed yet: bpmnlint-plugin-acme@1.0.0 (${ACME})`,
        },
        {
            case: "several packages, sorted, so the same set reads the same",
            blocked: [
                blocked(OTHER, false),
                blocked(ACME, true),
                blocked("/a/node_modules/z", false),
            ],
            line: `bpmnlint: bundled rules stand in for rule packages that are not allowed yet: @scope/bpmnlint-plugin-other@1.0.0 (${OTHER}), z@1.0.0 (/a/node_modules/z)`,
        },
    ])("logs $case", ({ blocked: given, line }) => {
        expect(shadowedRulePackageLogLine(given)).toEqual(line);
    });
});

describe("refusedRuleModuleLogLine", () => {
    const FILE = "/work/rules/naming.js";
    it.each<{ case: string; refused: RefusedRuleModule; line: string }>([
        {
            case: "a file outside every package",
            refused: { kind: "module", file: FILE, reason: "outsideNodeModules" },
            line: `bpmnlint: refused to run ${FILE}: it is neither in node_modules nor in the config's own package, so no allowance can cover it.`,
        },
        {
            case: "a file in no package folder",
            refused: { kind: "module", file: FILE, reason: "noPackageFolder" },
            line: `bpmnlint: refused to run ${FILE}: it belongs to no installed package folder.`,
        },
        {
            case: "a link to a folder that holds the config",
            refused: { kind: "module", file: FILE, reason: "linkHoldsConfigFolder" },
            line: `bpmnlint: refused to run ${FILE}: the package link it comes through points to a folder that holds the config.`,
        },
        {
            case: "a file inside a .git folder",
            refused: { kind: "module", file: FILE, reason: "insideGitFolder" },
            line: `bpmnlint: refused to run ${FILE}: it lies inside a .git folder, which no allowance covers.`,
        },
    ])("logs $case", ({ refused, line }) => {
        expect(refusedRuleModuleLogLine(refused)).toEqual(line);
    });
});
