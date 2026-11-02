import { describe, expect, it } from "vitest";

import { changesConfigLookup, ConfigLookup } from "./configLookup";

const TEMPLATES_LOOKUP: ConfigLookup = {
    documentDirectory: "/work/proc",
    workspaceRoot: "/work",
    entries: [".camunda/element-templates"],
};

const LINT_LOOKUP: ConfigLookup = {
    documentDirectory: "/work/proc",
    workspaceRoot: "/work",
    entries: [".bpmnlintrc", ".camunda/.bpmnlintrc"],
};

describe("changesConfigLookup", () => {
    it.each<{ behaviour: string; changedPath: string; lookup: ConfigLookup; changes: boolean }>([
        {
            behaviour: "counts a file below an entry of the document's folder",
            changedPath: "/work/proc/.camunda/element-templates/payment.json",
            lookup: TEMPLATES_LOOKUP,
            changes: true,
        },
        {
            behaviour: "counts a file below an entry of the workspace root",
            changedPath: "/work/.camunda/element-templates/payment.json",
            lookup: TEMPLATES_LOOKUP,
            changes: true,
        },
        {
            behaviour: "counts an entry itself",
            changedPath: "/work/.camunda/element-templates",
            lookup: TEMPLATES_LOOKUP,
            changes: true,
        },
        {
            behaviour: "counts the config folder holding an entry",
            changedPath: "/work/.camunda",
            lookup: TEMPLATES_LOOKUP,
            changes: true,
        },
        {
            behaviour: "counts the document's folder, which holds its entries",
            changedPath: "/work/proc",
            lookup: TEMPLATES_LOOKUP,
            changes: true,
        },
        {
            behaviour: "counts every entry of a lookup that reads several",
            changedPath: "/work/proc/.bpmnlintrc",
            lookup: LINT_LOOKUP,
            changes: true,
        },
        {
            behaviour: "ignores a config folder beside the lookup chain",
            changedPath: "/work/other/.camunda",
            lookup: TEMPLATES_LOOKUP,
            changes: false,
        },
        {
            behaviour: "ignores a config folder below the document's folder",
            changedPath: "/work/proc/sub/.camunda/element-templates/payment.json",
            lookup: TEMPLATES_LOOKUP,
            changes: false,
        },
        {
            behaviour: "ignores a config folder above the workspace root",
            changedPath: "/.camunda/element-templates/payment.json",
            lookup: TEMPLATES_LOOKUP,
            changes: false,
        },
        {
            behaviour: "ignores another file of the config folder",
            changedPath: "/work/.camunda/deployment-targets.json",
            lookup: TEMPLATES_LOOKUP,
            changes: false,
        },
        {
            behaviour: "ignores the document itself",
            changedPath: "/work/proc/order.bpmn",
            lookup: TEMPLATES_LOOKUP,
            changes: false,
        },
        {
            behaviour: "ignores a path that only shares an entry's name prefix",
            changedPath: "/work/proc/.bpmnlintrc.bak",
            lookup: LINT_LOOKUP,
            changes: false,
        },
        {
            behaviour: "reads nothing for a document outside the workspace root",
            changedPath: "/work/.camunda",
            lookup: { ...TEMPLATES_LOOKUP, documentDirectory: "/elsewhere/proc" },
            changes: false,
        },
        {
            behaviour: "reads the entry of an empty config folder from each directory",
            changedPath: "/work/element-templates/payment.json",
            lookup: { ...TEMPLATES_LOOKUP, entries: ["element-templates"] },
            changes: true,
        },
        {
            behaviour: "accepts the file:// directories the bridge answers for a file:// document",
            changedPath: "/work/.camunda",
            lookup: {
                ...TEMPLATES_LOOKUP,
                documentDirectory: "file:///work/proc",
                workspaceRoot: "file:///work",
            },
            changes: true,
        },
        {
            behaviour: "accepts IntelliJ's file:// spelling of a Windows drive",
            changedPath: "C:/work/.camunda",
            lookup: {
                ...TEMPLATES_LOOKUP,
                documentDirectory: "file://C:/work/proc",
                workspaceRoot: "file://C:/work",
            },
            changes: true,
        },
        {
            behaviour: "accepts VS Code's spelling of a Windows drive",
            changedPath: "/c:/work/.camunda",
            lookup: {
                ...TEMPLATES_LOOKUP,
                documentDirectory: "/c:/work/proc",
                workspaceRoot: "/c:/work",
            },
            changes: true,
        },
        {
            behaviour: "reads the entries of a drive root workspace",
            changedPath: "/c:/.camunda",
            lookup: { ...TEMPLATES_LOOKUP, documentDirectory: "/c:/proc", workspaceRoot: "/c:/" },
            changes: true,
        },
        {
            behaviour: "reads the entries of a workspace at the filesystem root",
            changedPath: "/.camunda/element-templates/payment.json",
            lookup: { ...TEMPLATES_LOOKUP, documentDirectory: "/proc", workspaceRoot: "/" },
            changes: true,
        },
        {
            behaviour: "keeps the server of a workspace on a UNC share",
            changedPath: "//server/share/work/.camunda",
            lookup: {
                ...TEMPLATES_LOOKUP,
                documentDirectory: "file:////server/share/work/proc",
                workspaceRoot: "//server/share/work",
            },
            changes: true,
        },
    ])("$behaviour", ({ changedPath, lookup, changes }) => {
        expect(changesConfigLookup(changedPath, lookup)).toBe(changes);
    });
});
