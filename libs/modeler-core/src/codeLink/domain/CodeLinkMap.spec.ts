import { describe, expect, it } from "vitest";

import { ImplementationEntry, implementationStatusKey } from "@miragon/bpmn-modeler-types";

import { CODE_LINK_SCHEMA_VERSION, CodeLinkMapJson, parseMapJson } from "./codeLinkArtifact";
import { CodeLink, CodeLinkMap, SourceFileChange } from "./CodeLinkMap";

const ROOT = "/work/proj";
const CHARGE_CLASS = "/work/proj/src/main/java/com/example/Charge.java";
const WORKER = "/work/proj/src/Worker.java";
const OTHER_WORKER = "/work/proj/src/OtherWorker.java";
const UNRELATED = "/work/proj/src/Unrelated.java";

const PAY_WORKER = '@JobWorker(type = "pay")';
const NO_WORKER = "class Worker {}";

const charge: ImplementationEntry = {
    activityId: "Activity_Charge",
    kind: "javaClass",
    reference: "com.example.Charge",
};
const pay: ImplementationEntry = { activityId: "Activity_Pay", kind: "jobType", reference: "pay" };
const refund: ImplementationEntry = {
    activityId: "Activity_Refund",
    kind: "jobType",
    reference: "refund",
};

function linked(entry: ImplementationEntry, ...paths: string[]): CodeLink {
    return { activityId: entry.activityId, kind: entry.kind, reference: entry.reference, paths };
}

function mapOf(...links: CodeLink[]): CodeLinkMap {
    return CodeLinkMap.empty.applyResolution(
        links,
        new Map(links.map((link) => [link.activityId, link.paths])),
    );
}

type PersistedEntry = CodeLinkMapJson["entries"][number];

function artifactOf(...entries: PersistedEntry[]): CodeLinkMapJson {
    return {
        schemaVersion: CODE_LINK_SCHEMA_VERSION,
        bpmnFile: "order.bpmn",
        generatedAt: "t",
        entries,
    };
}

function written(path: string, content: string | undefined): SourceFileChange {
    return { kind: "written", path, content };
}

function deleted(path: string): SourceFileChange {
    return { kind: "deleted", path };
}

function unreadable(path: string): SourceFileChange {
    return { kind: "unreadable", path };
}

describe("CodeLinkMap.admits", () => {
    it.each<{ name: string; entry: ImplementationEntry; admitted: boolean }>([
        { name: "a complete entry", entry: pay, admitted: true },
        { name: "an empty activity id", entry: { ...pay, activityId: "" }, admitted: false },
        { name: "an empty reference", entry: { ...pay, reference: "" }, admitted: false },
        { name: "an unknown kind", entry: { ...pay, kind: "bogus" as never }, admitted: false },
        {
            name: "a non-string activity id",
            entry: { ...pay, activityId: [pay.activityId] as never },
            admitted: false,
        },
        {
            name: "a non-string reference",
            entry: { ...pay, reference: null as never },
            admitted: false,
        },
    ])("$name → $admitted", ({ entry, admitted }) => {
        expect(CodeLinkMap.admits(entry)).toBe(admitted);
    });
});

describe("CodeLinkMap.planSync", () => {
    const changedReference = { ...pay, reference: "refund" };
    const changedKind: ImplementationEntry = { ...pay, kind: "externalTopic" };

    it.each<{
        name: string;
        held: CodeLink[];
        incoming: ImplementationEntry[];
        retained: CodeLink[];
        toVerify: CodeLink[];
        toResolve: ImplementationEntry[];
    }>([
        {
            name: "resolves a new activity",
            held: [],
            incoming: [pay],
            retained: [],
            toVerify: [],
            toResolve: [pay],
        },
        {
            name: "verifies an unchanged resolved activity",
            held: [linked(pay, WORKER)],
            incoming: [pay],
            retained: [linked(pay, WORKER)],
            toVerify: [linked(pay, WORKER)],
            toResolve: [],
        },
        {
            name: "leaves an unchanged unresolved activity to the watcher",
            held: [linked(pay)],
            incoming: [pay],
            retained: [linked(pay)],
            toVerify: [],
            toResolve: [],
        },
        {
            name: "re-resolves an activity whose reference changed",
            held: [linked(pay, WORKER)],
            incoming: [changedReference],
            retained: [],
            toVerify: [],
            toResolve: [changedReference],
        },
        {
            name: "re-resolves an activity whose kind changed",
            held: [linked(pay, WORKER)],
            incoming: [changedKind],
            retained: [],
            toVerify: [],
            toResolve: [changedKind],
        },
        {
            name: "drops an activity the diagram no longer has",
            held: [linked(pay, WORKER), linked(charge, CHARGE_CLASS)],
            incoming: [charge],
            retained: [linked(charge, CHARGE_CLASS)],
            toVerify: [linked(charge, CHARGE_CLASS)],
            toResolve: [],
        },
        {
            name: "ignores the entries it does not admit",
            held: [],
            incoming: [
                pay,
                { ...charge, activityId: "" },
                { activityId: "B", kind: "bogus" as never, reference: "z" },
            ],
            retained: [],
            toVerify: [],
            toResolve: [pay],
        },
        {
            name: "drops a held activity whose entry it does not admit",
            held: [linked(pay, WORKER)],
            incoming: [{ ...pay, kind: "bogus" as never }],
            retained: [],
            toVerify: [],
            toResolve: [],
        },
    ])("$name", ({ held, incoming, retained, toVerify, toResolve }) => {
        const plan = mapOf(...held).planSync(incoming);

        expect({
            retained: plan.retained.links,
            toVerify: plan.toVerify,
            toResolve: plan.toResolve,
        }).toEqual({ retained, toVerify, toResolve });
    });
});

describe("CodeLinkMap.applyVerification", () => {
    it.each<{
        name: string;
        held: CodeLink[];
        survivors: [string, string[]][];
        links: CodeLink[];
        toResolve: ImplementationEntry[];
    }>([
        {
            name: "keeps the files that still implement the activity",
            held: [linked(pay, WORKER, OTHER_WORKER)],
            survivors: [[pay.activityId, [WORKER]]],
            links: [linked(pay, WORKER)],
            toResolve: [],
        },
        {
            name: "re-resolves an activity none of whose files survived",
            held: [linked(pay, WORKER)],
            survivors: [[pay.activityId, []]],
            links: [linked(pay)],
            toResolve: [pay],
        },
        {
            name: "leaves an activity it did not verify",
            held: [linked(pay, WORKER), linked(charge, CHARGE_CLASS)],
            survivors: [[pay.activityId, [WORKER]]],
            links: [linked(pay, WORKER), linked(charge, CHARGE_CLASS)],
            toResolve: [],
        },
        {
            name: "never links a file the activity did not hold",
            held: [linked(pay, WORKER)],
            survivors: [[pay.activityId, [WORKER, OTHER_WORKER]]],
            links: [linked(pay, WORKER)],
            toResolve: [],
        },
        {
            name: "never re-resolves an unresolved activity",
            held: [linked(pay)],
            survivors: [[pay.activityId, []]],
            links: [linked(pay)],
            toResolve: [],
        },
        {
            name: "ignores a survivor of an activity it does not hold",
            held: [],
            survivors: [[pay.activityId, [WORKER]]],
            links: [],
            toResolve: [],
        },
    ])("$name", ({ held, survivors, links, toResolve }) => {
        const verified = mapOf(...held).applyVerification(new Map(survivors));

        expect({ links: verified.map.links, toResolve: verified.toResolve }).toEqual({
            links,
            toResolve,
        });
    });
});

describe("CodeLinkMap.applyResolution", () => {
    it.each<{
        name: string;
        held: CodeLink[];
        entries: ImplementationEntry[];
        resolved: [string, string[]][];
        links: CodeLink[];
    }>([
        {
            name: "links the files found for an activity",
            held: [],
            entries: [pay],
            resolved: [[pay.activityId, [WORKER, OTHER_WORKER]]],
            links: [linked(pay, WORKER, OTHER_WORKER)],
        },
        {
            name: "holds an activity nothing implements as unresolved",
            held: [],
            entries: [pay],
            resolved: [],
            links: [linked(pay)],
        },
        {
            name: "lists a file found twice once",
            held: [],
            entries: [pay],
            resolved: [[pay.activityId, [WORKER, WORKER]]],
            links: [linked(pay, WORKER)],
        },
        {
            name: "replaces the held link of a re-resolved activity",
            held: [linked(pay)],
            entries: [pay],
            resolved: [[pay.activityId, [WORKER]]],
            links: [linked(pay, WORKER)],
        },
        {
            name: "keeps the links it did not resolve",
            held: [linked(charge, CHARGE_CLASS)],
            entries: [pay],
            resolved: [[pay.activityId, [WORKER]]],
            links: [linked(charge, CHARGE_CLASS), linked(pay, WORKER)],
        },
        {
            name: "keeps only the binding of an entry",
            held: [],
            entries: [{ ...pay, extra: "x" } as ImplementationEntry],
            resolved: [],
            links: [linked(pay)],
        },
    ])("$name", ({ held, entries, resolved, links }) => {
        expect(mapOf(...held).applyResolution(entries, new Map(resolved)).links).toEqual(links);
    });
});

describe("CodeLinkMap.isResolved", () => {
    it.each<{ name: string; activityId: string; resolved: boolean }>([
        { name: "an activity with a linked file", activityId: pay.activityId, resolved: true },
        {
            name: "an activity without a linked file",
            activityId: refund.activityId,
            resolved: false,
        },
        { name: "an activity the map does not hold", activityId: "Unknown", resolved: false },
    ])("$name → $resolved", ({ activityId, resolved }) => {
        expect(mapOf(linked(pay, WORKER), linked(refund)).isResolved(activityId)).toBe(resolved);
    });
});

describe("CodeLinkMap.applyFileChange", () => {
    it.each<{
        name: string;
        held: CodeLink[];
        change: SourceFileChange;
        links: CodeLink[];
        changed: boolean;
    }>([
        {
            name: "links a written file to an unresolved activity it implements",
            held: [linked(pay)],
            change: written(WORKER, PAY_WORKER),
            links: [linked(pay, WORKER)],
            changed: true,
        },
        {
            name: "links a further written file to a resolved activity",
            held: [linked(pay, WORKER)],
            change: written(OTHER_WORKER, PAY_WORKER),
            links: [linked(pay, WORKER, OTHER_WORKER)],
            changed: true,
        },
        {
            name: "links a written class by its path alone",
            held: [linked(charge)],
            change: written(CHARGE_CLASS, undefined),
            links: [linked(charge, CHARGE_CLASS)],
            changed: true,
        },
        {
            name: "links one written file to every activity it implements",
            held: [linked(pay), linked(refund)],
            change: written(WORKER, '"pay" "refund"'),
            links: [linked(pay, WORKER), linked(refund, WORKER)],
            changed: true,
        },
        {
            name: "links a written file only to the activities it implements",
            held: [linked(pay), linked(refund)],
            change: written(WORKER, PAY_WORKER),
            links: [linked(pay, WORKER), linked(refund)],
            changed: true,
        },
        {
            name: "keeps a written file that still implements its activity",
            held: [linked(pay, WORKER)],
            change: written(WORKER, PAY_WORKER),
            links: [linked(pay, WORKER)],
            changed: false,
        },
        {
            name: "unlinks a written file that stopped implementing its activity",
            held: [linked(pay, WORKER, OTHER_WORKER)],
            change: written(WORKER, NO_WORKER),
            links: [linked(pay, OTHER_WORKER)],
            changed: true,
        },
        {
            name: "leaves the activity unresolved when its last file stops implementing it",
            held: [linked(pay, WORKER)],
            change: written(WORKER, NO_WORKER),
            links: [linked(pay)],
            changed: true,
        },
        {
            name: "keeps a link when the written file cannot be read",
            held: [linked(pay, WORKER)],
            change: unreadable(WORKER),
            links: [linked(pay, WORKER)],
            changed: false,
        },
        {
            name: "does not link a written file that cannot be read",
            held: [linked(charge)],
            change: unreadable(CHARGE_CLASS),
            links: [linked(charge)],
            changed: false,
        },
        {
            name: "leaves the map unchanged for a written file no activity cares about",
            held: [linked(pay, WORKER), linked(charge)],
            change: written(UNRELATED, "class Unrelated {}"),
            links: [linked(pay, WORKER), linked(charge)],
            changed: false,
        },
        {
            name: "unlinks a deleted file",
            held: [linked(pay, WORKER, OTHER_WORKER)],
            change: deleted(WORKER),
            links: [linked(pay, OTHER_WORKER)],
            changed: true,
        },
        {
            name: "leaves the activity unresolved when its last file is deleted",
            held: [linked(pay, WORKER)],
            change: deleted(WORKER),
            links: [linked(pay)],
            changed: true,
        },
        {
            name: "unlinks a deleted file from every activity",
            held: [linked(pay, WORKER), linked(refund, WORKER, OTHER_WORKER)],
            change: deleted(WORKER),
            links: [linked(pay), linked(refund, OTHER_WORKER)],
            changed: true,
        },
        {
            name: "unlinks a deleted class whose path still names it",
            held: [linked(charge, CHARGE_CLASS)],
            change: deleted(CHARGE_CLASS),
            links: [linked(charge)],
            changed: true,
        },
        {
            name: "leaves the map unchanged for a deleted file no activity links",
            held: [linked(pay, WORKER)],
            change: deleted(OTHER_WORKER),
            links: [linked(pay, WORKER)],
            changed: false,
        },
    ])("$name", ({ held, change, links, changed }) => {
        const result = mapOf(...held).applyFileChange(change);

        expect({ links: result.map.links, changed: result.changed }).toEqual({ links, changed });
    });
});

describe("CodeLinkMap.statusSnapshot", () => {
    it("keys each activity's resolution by its id and reference", () => {
        expect(mapOf(linked(pay, WORKER), linked(charge)).statusSnapshot()).toEqual({
            [implementationStatusKey(pay.activityId, pay.reference)]: true,
            [implementationStatusKey(charge.activityId, charge.reference)]: false,
        });
    });

    it("is empty for an empty map", () => {
        expect(CodeLinkMap.empty.statusSnapshot()).toEqual({});
    });
});

describe("CodeLinkMap — immutability", () => {
    it.each<{ name: string; apply: (map: CodeLinkMap) => unknown }>([
        { name: "planSync", apply: (map) => map.planSync([refund]) },
        {
            name: "applyVerification",
            apply: (map) => map.applyVerification(new Map([[pay.activityId, []]])),
        },
        {
            name: "applyResolution",
            apply: (map) => map.applyResolution([pay], new Map([[pay.activityId, [OTHER_WORKER]]])),
        },
        { name: "applyFileChange", apply: (map) => map.applyFileChange(deleted(WORKER)) },
    ])("$name leaves the map it is applied to unchanged", ({ apply }) => {
        const map = mapOf(linked(pay, WORKER));

        apply(map);

        expect(map.links).toEqual([linked(pay, WORKER)]);
    });
});

describe("CodeLinkMap — artifact", () => {
    it.each<{ name: string; persisted: PersistedEntry; links: CodeLink[]; resolved: boolean }>([
        {
            name: "resolves an activity by its paths",
            persisted: { ...pay, resolved: true, paths: ["src/Worker.java"] },
            links: [linked(pay, WORKER)],
            resolved: true,
        },
        {
            name: "holds an activity persisted as resolved without paths as unresolved",
            persisted: { ...pay, resolved: true, paths: [] },
            links: [linked(pay)],
            resolved: false,
        },
        {
            name: "holds an activity persisted as unresolved with a path as resolved",
            persisted: { ...pay, resolved: false, paths: ["src/Worker.java"] },
            links: [linked(pay, WORKER)],
            resolved: true,
        },
        {
            name: "lists a path persisted twice once",
            persisted: { ...pay, resolved: true, paths: ["src/Worker.java", "src/Worker.java"] },
            links: [linked(pay, WORKER)],
            resolved: true,
        },
        {
            name: "drops an entry it does not admit",
            persisted: { ...pay, kind: "bogus" as never, resolved: true, paths: [] },
            links: [],
            resolved: false,
        },
    ])("fromArtifact $name", ({ persisted, links, resolved }) => {
        const map = CodeLinkMap.fromArtifact(artifactOf(persisted), ROOT);

        expect({ links: map.links, resolved: map.isResolved(pay.activityId) }).toEqual({
            links,
            resolved,
        });
    });

    it("verifies a warm link persisted as unresolved with a path", () => {
        const warm = CodeLinkMap.fromArtifact(
            artifactOf({ ...pay, resolved: false, paths: ["src/Worker.java"] }),
            ROOT,
        );

        expect(warm.planSync([pay]).toVerify).toEqual([linked(pay, WORKER)]);
    });

    it("writes a workspace-relative artifact that derives resolved from the paths", () => {
        const map = mapOf(linked(charge, CHARGE_CLASS), linked(pay));

        expect(
            map.toArtifact({
                bpmnFile: "src/main/resources/order.bpmn",
                generatedAt: "2026-06-03T10:15:30.000Z",
                workspaceRoot: ROOT,
            }),
        ).toEqual({
            schemaVersion: 1,
            bpmnFile: "src/main/resources/order.bpmn",
            generatedAt: "2026-06-03T10:15:30.000Z",
            entries: [
                {
                    activityId: "Activity_Charge",
                    kind: "javaClass",
                    reference: "com.example.Charge",
                    resolved: true,
                    paths: ["src/main/java/com/example/Charge.java"],
                },
                {
                    activityId: "Activity_Pay",
                    kind: "jobType",
                    reference: "pay",
                    resolved: false,
                    paths: [],
                },
            ],
        });
    });

    it("round-trips through the written and parsed artifact", () => {
        const links = [linked(charge, CHARGE_CLASS), linked(pay), linked(refund, WORKER)];
        const artifact = mapOf(...links).toArtifact({
            bpmnFile: "order.bpmn",
            generatedAt: "t",
            workspaceRoot: ROOT,
        });

        const parsed = parseMapJson(JSON.stringify(artifact));

        expect(CodeLinkMap.fromArtifact(parsed!, ROOT).links).toEqual(links);
    });
});
