import { describe, expect, it } from "vitest";

import { CredentialDestinations } from "./credentialDestinations";
import {
    additionalFilesPrompt,
    credentialApprovalConfirmation,
    deleteTargetConfirmation,
    deployableFilesPrompt,
    deploymentStatusActionPrompt,
    deploymentTargetPrompt,
    payloadFilePrompt,
} from "./deploymentPrompts";

const fileChoice = (path: string, label: string) => ({ label, path, value: path });

describe("payloadFilePrompt", () => {
    it.each([
        { behaviour: "offers nothing when no payload was found", paths: [], items: [] },
        {
            behaviour: "offers each payload by its file name, nearest first as found",
            paths: ["/work/sub/.camunda/payloads/order.json", "/work/.camunda/payloads/base.json"],
            items: [
                fileChoice("/work/sub/.camunda/payloads/order.json", "order.json"),
                fileChoice("/work/.camunda/payloads/base.json", "base.json"),
            ],
        },
        {
            behaviour: "tells payloads of the same name apart by their path",
            paths: ["/work/a/.camunda/payloads/vars.json", "/work/.camunda/payloads/vars.json"],
            items: [
                fileChoice("/work/a/.camunda/payloads/vars.json", "vars.json"),
                fileChoice("/work/.camunda/payloads/vars.json", "vars.json"),
            ],
        },
    ])("$behaviour", ({ paths, items }) => {
        expect(payloadFilePrompt(paths)).toStrictEqual({
            id: "payloadFile",
            placeholder: "Select a payload file",
            items,
        });
    });
});

describe("deploymentTargetPrompt", () => {
    it.each([
        {
            behaviour: "offers only the form values when no target is saved",
            names: [],
            items: [{ label: "(none — use form values)", value: "" }],
        },
        {
            behaviour: "offers the form values first, then each saved target",
            names: ["dev", "prod"],
            items: [
                { label: "(none — use form values)", value: "" },
                { label: "dev", value: "dev" },
                { label: "prod", value: "prod" },
            ],
        },
    ])("$behaviour", ({ names, items }) => {
        expect(deploymentTargetPrompt(names)).toStrictEqual({
            id: "deploymentTarget",
            placeholder: "Select the active deployment target",
            items,
        });
    });
});

describe("deploymentStatusActionPrompt", () => {
    const SWITCH = { label: "Switch deployment target…", icon: "swap", value: "switch" };

    it.each([
        {
            behaviour: "offers to verify on a named Camunda 7 target",
            activeTarget: { name: "dev", engine: "c7" as const },
            placeholder: 'Deployment target "dev"',
            items: [SWITCH, { label: "Verify on dev", icon: "cloud", value: "verify" }],
        },
        {
            behaviour: "offers only the switch for a Camunda 8 target, which has no lookup",
            activeTarget: { name: "cloud", engine: "c8" as const },
            placeholder: 'Deployment target "cloud"',
            items: [SWITCH],
        },
        {
            behaviour: "offers only the switch without a named target",
            activeTarget: undefined,
            placeholder: "No deployment target selected",
            items: [SWITCH],
        },
    ])("$behaviour", ({ activeTarget, placeholder, items }) => {
        expect(deploymentStatusActionPrompt(activeTarget)).toStrictEqual({
            id: "deploymentStatusAction",
            placeholder,
            items,
        });
    });
});

/** Found in this order in the folders `/work` and `/archive/zeta`. */
const FOUND_IN_TWO_FOLDERS = [
    "/work/processes/order.bpmn",
    "/archive/zeta/legacy.bpmn",
    "/work/decisions/discount.dmn",
];
const TWO_FOLDERS = ["/work", "/archive/zeta"];
/** As VS Code shows them: work/decisions/…, work/processes/…, zeta/legacy.bpmn. */
const IN_WORKSPACE_ORDER = [
    fileChoice("/work/decisions/discount.dmn", "discount.dmn"),
    fileChoice("/work/processes/order.bpmn", "order.bpmn"),
    fileChoice("/archive/zeta/legacy.bpmn", "legacy.bpmn"),
];

describe("deployableFilesPrompt", () => {
    it.each([
        {
            behaviour: "offers nothing when no file was found",
            files: [],
            workspaceFolders: ["/work"],
            items: [],
        },
        {
            behaviour: "offers each file by its name, ordered as VS Code shows the paths",
            files: FOUND_IN_TWO_FOLDERS,
            workspaceFolders: TWO_FOLDERS,
            items: IN_WORKSPACE_ORDER,
        },
    ])("$behaviour", ({ files, workspaceFolders, items }) => {
        expect(deployableFilesPrompt({ targetName: "dev", files, workspaceFolders })).toStrictEqual(
            {
                id: "deployableFiles",
                placeholder: 'Select files to deploy to "dev"',
                items,
            },
        );
    });

    it("names the target the files go to", () => {
        expect(
            deployableFilesPrompt({ targetName: "prod", files: [], workspaceFolders: [] })
                .placeholder,
        ).toBe('Select files to deploy to "prod"');
    });
});

describe("additionalFilesPrompt", () => {
    it.each([
        {
            behaviour: "offers nothing when no file was found",
            files: [],
            workspaceFolders: ["/work"],
            items: [],
        },
        {
            behaviour: "offers each file by its name, ordered as VS Code shows the paths",
            files: FOUND_IN_TWO_FOLDERS,
            workspaceFolders: TWO_FOLDERS,
            items: IN_WORKSPACE_ORDER,
        },
    ])("$behaviour", ({ files, workspaceFolders, items }) => {
        expect(additionalFilesPrompt({ files, workspaceFolders })).toStrictEqual({
            id: "additionalFiles",
            placeholder: "Select additional files to include in the deployment",
            items,
        });
    });
});

describe("deleteTargetConfirmation", () => {
    it.each(["dev", "prod"])("names target %s and its credentials as what goes", (name) => {
        expect(deleteTargetConfirmation(name)).toStrictEqual({
            id: "deleteTarget",
            title: `Delete deployment target "${name}"?`,
            confirmLabel: "Delete",
            details: [`Target "${name}" and its stored credentials will be removed.`],
        });
    });
});

describe("credentialApprovalConfirmation", () => {
    const WHERE_THEY_GO =
        "The shared deployment targets file and .env decide where they go. Continue only if you expect this host.";

    it.each([
        {
            behaviour: "says no host is approved yet",
            connectionLabel: 'target "prod"',
            approved: CredentialDestinations.none(),
            unapproved: CredentialDestinations.of("https://evil.example.com/engine-rest"),
            title: "Send credentials and .env values to https://evil.example.com?",
            details: [
                'They belong to target "prod".',
                "No host is approved for them yet.",
                WHERE_THEY_GO,
            ],
        },
        {
            behaviour: "lists the hosts approved so far and asks about every new one",
            connectionLabel: "the ad-hoc connection",
            approved: CredentialDestinations.of(
                "https://trusted.example.com/engine-rest",
                "https://idp.example.com/token",
            ),
            unapproved: CredentialDestinations.of(
                "https://evil.example.com/engine-rest",
                "http://evil.example.com:8080/start",
            ),
            title: "Send credentials and .env values to http://evil.example.com:8080, https://evil.example.com?",
            details: [
                "They belong to the ad-hoc connection.",
                "Approved so far: https://idp.example.com, https://trusted.example.com.",
                WHERE_THEY_GO,
            ],
        },
    ])("$behaviour", ({ connectionLabel, approved, unapproved, title, details }) => {
        expect(
            credentialApprovalConfirmation({ connectionLabel, approved, unapproved }),
        ).toStrictEqual({
            id: "credentialApproval",
            title,
            confirmLabel: "Send Credentials",
            details,
        });
    });
});
