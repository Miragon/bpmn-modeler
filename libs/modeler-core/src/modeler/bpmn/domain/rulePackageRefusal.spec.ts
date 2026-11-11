import { describe, expect, it } from "vitest";

import { type ResolvedRuleModule } from "./rulePackageApproval";
import { approvalRootOf } from "./rulePackageRefusal";

const WORKSPACE = "/w";
const ACME = `${WORKSPACE}/node_modules/bpmnlint-plugin-acme`;

describe("approvalRootOf", () => {
    it.each<{ case: string; module: ResolvedRuleModule; root: ReturnType<typeof approvalRootOf> }>([
        {
            case: "a package's own file to that package",
            module: {
                file: `${ACME}/rules/a.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: false,
            },
            root: { kind: "package", id: ACME },
        },
        {
            case: "the self-package's file to the config folder",
            module: {
                file: `${WORKSPACE}/index.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: true,
            },
            root: { kind: "selfPackage", id: WORKSPACE },
        },
        {
            case: "a workspace file outside node_modules to a refusal",
            module: {
                file: `${WORKSPACE}/scripts/evil.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: false,
            },
            root: {
                kind: "module",
                file: `${WORKSPACE}/scripts/evil.js`,
                reason: "outsideNodeModules",
            },
        },
        {
            case: "a package file inside a .git folder to a refusal",
            module: {
                file: `${ACME}/.git/evil.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: false,
            },
            root: { kind: "module", file: `${ACME}/.git/evil.js`, reason: "insideGitFolder" },
        },
        {
            case: "a self-package file inside a nested .git folder to a refusal",
            module: {
                file: `${WORKSPACE}/rules/.git/hooks/evil.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: true,
            },
            root: {
                kind: "module",
                file: `${WORKSPACE}/rules/.git/hooks/evil.js`,
                reason: "insideGitFolder",
            },
        },
        {
            case: "a self-package model file to the config folder, as its allowance covers it",
            module: {
                file: `${WORKSPACE}/rules.bpmn`,
                configDir: WORKSPACE,
                requestsSelfPackage: true,
            },
            root: { kind: "selfPackage", id: WORKSPACE },
        },
        {
            case: "a file whose name only starts like .git to its package",
            module: {
                file: `${ACME}/.github/rule.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: false,
            },
            root: { kind: "package", id: ACME },
        },
    ])("maps $case", ({ module, root }) => {
        expect(approvalRootOf(module)).toEqual(root);
    });
});
