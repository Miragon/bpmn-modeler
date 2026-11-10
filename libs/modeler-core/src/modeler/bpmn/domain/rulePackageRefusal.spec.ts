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
            case: "a package file its hash leaves out to a refusal",
            module: {
                file: `${ACME}/.git/evil.js`,
                configDir: WORKSPACE,
                requestsSelfPackage: false,
            },
            root: { kind: "module", file: `${ACME}/.git/evil.js`, reason: "notHashed" },
        },
        {
            case: "a self-package model file to a refusal",
            module: {
                file: `${WORKSPACE}/evil.bpmn`,
                configDir: WORKSPACE,
                requestsSelfPackage: true,
            },
            root: { kind: "module", file: `${WORKSPACE}/evil.bpmn`, reason: "notHashed" },
        },
    ])("maps $case", ({ module, root }) => {
        expect(approvalRootOf(module)).toEqual(root);
    });
});
