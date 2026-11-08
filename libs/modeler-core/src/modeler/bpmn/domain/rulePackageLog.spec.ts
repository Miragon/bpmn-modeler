import { describe, expect, it } from "vitest";

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
): BlockedRulePackage => ({ id, kind: "package", state, needed });

describe("neededRulePackageLogLines", () => {
    it.each<{ case: string; blocked: BlockedRulePackage[]; lines: string[] }>([
        {
            case: "a new package whose rules were skipped",
            blocked: [blocked(ACME, true)],
            lines: [
                `bpmnlint: rule package ${ACME} is not allowed yet (new), so rules from it are skipped.`,
            ],
        },
        {
            case: "a package changed since it was allowed",
            blocked: [blocked(ACME, true, "changed")],
            lines: [
                `bpmnlint: rule package ${ACME} is not allowed yet (changed since you allowed it), so rules from it are skipped.`,
            ],
        },
        {
            case: "a package declined this session",
            blocked: [blocked(ACME, true, "declined")],
            lines: [
                `bpmnlint: rule package ${ACME} is not allowed yet (declined this session), so rules from it are skipped.`,
            ],
        },
        {
            case: "one line per package, and none for a package the bundle stood in for",
            blocked: [blocked(OTHER, true), blocked(ACME, false), blocked(OTHER, true)],
            lines: [
                `bpmnlint: rule package ${OTHER} is not allowed yet (new), so rules from it are skipped.`,
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
            line: `bpmnlint: bundled rules stand in for a rule package that is not allowed yet: ${ACME}`,
        },
        {
            case: "several packages, sorted, so the same set reads the same",
            blocked: [
                blocked(OTHER, false),
                blocked(ACME, true),
                blocked("/a/node_modules/z", false),
            ],
            line: `bpmnlint: bundled rules stand in for rule packages that are not allowed yet: /a/node_modules/z, ${OTHER}`,
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
            line: `bpmnlint: refused to run ${FILE}: it is neither in node_modules nor in the config's own package, so no approval can cover it.`,
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
            case: "a file the content hash leaves out",
            refused: { kind: "module", file: FILE, reason: "notHashed" },
            line: `bpmnlint: refused to run ${FILE}: the rule package's content hash leaves it out.`,
        },
        {
            case: "a package that links outside its folder",
            refused: { kind: "closure", id: ACME, memberDir: ACME, reason: "linksOutsideFolder" },
            line: `bpmnlint: rule package ${ACME} cannot be allowed: it links to files outside its folder.`,
        },
        {
            case: "a dependency too large to check",
            refused: { kind: "closure", id: ACME, memberDir: OTHER, reason: "tooLarge" },
            line: `bpmnlint: rule package ${ACME} cannot be allowed: its dependency ${OTHER} is too large to check.`,
        },
        {
            case: "an unreadable package",
            refused: { kind: "closure", id: ACME, memberDir: ACME, reason: "unreadable" },
            line: `bpmnlint: rule package ${ACME} cannot be allowed: it could not be read.`,
        },
        {
            case: "a package holding a special file",
            refused: { kind: "closure", id: ACME, memberDir: ACME, reason: "specialFile" },
            line: `bpmnlint: rule package ${ACME} cannot be allowed: it holds a file that is not a regular file.`,
        },
        {
            case: "a package in a layout the check does not support",
            refused: { kind: "closure", id: ACME, memberDir: ACME, reason: "unsupportedLayout" },
            line: `bpmnlint: rule package ${ACME} cannot be allowed: it is installed in a layout the check does not support.`,
        },
    ])("logs $case", ({ refused, line }) => {
        expect(refusedRuleModuleLogLine(refused)).toEqual(line);
    });
});
