import { describe, expect, it } from "vitest";

import {
    directivesWithoutIssue,
    exceptionsWithoutIssue,
    staleExceptions,
    unexcusedViolations,
} from "./knownExceptions";

const target = "deployment/domain/deploymentTarget.ts";
const ports = "deployment/domain/ports.ts";
const gitHubSource = "template-marketplace/infrastructure/GitHubSource.ts";
const camundaClient = "deployment/infrastructure/camunda/Camunda7RestClient.ts";
const service = "deployment/service/DeploymentService.ts";
const handlers = "deployment/infrastructure/deploymentMessageHandlers.ts";

describe("known exceptions", () => {
    it.each([
        {
            name: "a file exception covers that file's import",
            exception: { from: target, to: "@miragon/bpmn-modeler-shared" },
            violation: { from: target, to: "@miragon/bpmn-modeler-shared" },
            covers: true,
        },
        {
            name: "a file exception does not cover a sibling file",
            exception: { from: target, to: "@miragon/bpmn-modeler-shared" },
            violation: { from: ports, to: "@miragon/bpmn-modeler-shared" },
            covers: false,
        },
        {
            name: "a file exception does not cover another package",
            exception: { from: target, to: "@miragon/bpmn-modeler-shared" },
            violation: { from: target, to: "node:fs" },
            covers: false,
        },
        {
            name: "a feature exception covers every file of the pair",
            exception: { from: "template-marketplace", to: "deployment" },
            violation: { from: gitHubSource, to: ports },
            covers: true,
        },
        {
            name: "a feature exception matches whole path segments only",
            exception: { from: "template", to: "deployment" },
            violation: { from: gitHubSource, to: ports },
            covers: false,
        },
        {
            name: "a feature exception has a direction",
            exception: { from: "deployment", to: "template-marketplace" },
            violation: { from: gitHubSource, to: ports },
            covers: false,
        },
        {
            name: "a wildcard importer covers any module importing the target",
            exception: { from: "*", to: camundaClient },
            violation: { from: service, to: camundaClient },
            covers: true,
        },
        {
            name: "a wildcard importer does not widen the target",
            exception: { from: "*", to: camundaClient },
            violation: { from: service, to: handlers },
            covers: false,
        },
    ])("$name", ({ exception, violation, covers }) => {
        const known = { ...exception, until: "#0" };

        expect(unexcusedViolations([violation], [known])).toEqual(covers ? [] : [violation]);
        expect(staleExceptions([violation], [known])).toEqual(covers ? [] : [known]);
    });

    it("keeps the caller's violation shape", () => {
        const violation = { from: target, to: "node:fs", rule: "domain" };

        expect(unexcusedViolations([violation], [])).toEqual([violation]);
    });

    it("lists exceptions that name no issue", () => {
        const named = { from: "a", to: "b", until: "#2063" };
        const unnamed = { from: "a", to: "c", until: "later" };

        expect(exceptionsWithoutIssue([named, unnamed])).toEqual([unnamed]);
    });
});

describe("directivesWithoutIssue", () => {
    const rule = "miragon/no-guarded-value-comparison";

    it.each([
        `// eslint-disable-next-line ${rule} -- #2051: the parser owns this value`,
        `/* eslint-disable ${rule} -- #2051: generated fixture */`,
        `// eslint-disable-line no-console, ${rule} -- #12: a reason`,
    ])("accepts a directive naming an issue and a reason: %s", (comment) => {
        expect(directivesWithoutIssue([comment], rule)).toEqual([]);
    });

    it.each([
        `// eslint-disable-next-line ${rule}`,
        `// eslint-disable-next-line ${rule} -- the parser owns this value`,
        `// eslint-disable-next-line ${rule} -- #2051`,
        `// eslint-disable-next-line ${rule} -- #2051:`,
        `/* eslint-disable ${rule} */`,
        `// eslint-disable-line ${rule} -- see #2051: below`,
    ])("rejects %s", (comment) => {
        expect(directivesWithoutIssue([comment], rule)).toEqual([comment]);
    });

    it.each([
        "// eslint-disable-next-line no-console",
        `// ${rule} keeps engine rules in one place`,
        `// eslint-enable ${rule}`,
    ])("ignores a comment that disables no such rule: %s", (comment) => {
        expect(directivesWithoutIssue([comment], rule)).toEqual([]);
    });
});
