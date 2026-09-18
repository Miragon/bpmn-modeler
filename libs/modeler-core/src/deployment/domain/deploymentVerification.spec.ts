import { describe, expect, it } from "vitest";

import { contentFingerprint, DeployedRevision } from "./deploymentLedger";
import { EngineDeploymentSnapshot, reconcile } from "./deploymentVerification";

const XML = '<bpmn:process id="order"/>';

const snapshot = (overrides: Partial<EngineDeploymentSnapshot> = {}): EngineDeploymentSnapshot => ({
    processDefinitionId: "order:3:def-1",
    deploymentId: "dep-9",
    resourceName: "order.bpmn",
    xml: XML,
    deploymentTime: "2026-09-17T14:40:00.000Z",
    ...overrides,
});

const recorded = (overrides: Partial<DeployedRevision> = {}): DeployedRevision => ({
    fingerprint: contentFingerprint(XML),
    deployedAt: "2026-09-17T14:32:00.000Z",
    deploymentId: "dep-9",
    ...overrides,
});

describe("reconcile", () => {
    it("is missing without an engine snapshot", () => {
        expect(reconcile(recorded(), XML, undefined)).toEqual({ outcome: "missing" });
    });

    it("is current when the engine still runs the recorded deployment", () => {
        const result = reconcile(recorded(), "<edited/>", snapshot());

        expect(result.outcome).toBe("current");
        expect(result.revision).toMatchObject(recorded());
        expect(result.revision?.verifiedAt).toEqual(expect.any(String));
    });

    it("adopts an engine revision matching the editor content", () => {
        const result = reconcile(undefined, XML, snapshot());

        expect(result.outcome).toBe("adopted");
        expect(result.revision).toMatchObject({
            fingerprint: contentFingerprint(XML),
            deployedAt: "2026-09-17T14:40:00.000Z",
            deploymentId: "dep-9",
            origin: "engine",
        });
    });

    it("is superseded when the engine deployment differs from the editor", () => {
        const result = reconcile(
            recorded({ deploymentId: "dep-1" }),
            XML,
            snapshot({ xml: "<different/>" }),
        );

        expect(result.outcome).toBe("superseded");
        expect(result.revision).toMatchObject({
            fingerprint: contentFingerprint("<different/>"),
            deploymentId: "dep-9",
            origin: "engine",
        });
    });

    it("falls back to the verification time when the engine reports no deployment time", () => {
        const result = reconcile(undefined, XML, snapshot({ deploymentTime: undefined }));

        expect(result.revision?.deployedAt).toBe(result.revision?.verifiedAt);
    });

    it("tolerates BOM and CRLF differences between engine bytes and editor buffer", () => {
        const engineXml = "﻿" + XML.replace(/\n/g, "\r\n") + "\r\n";
        const result = reconcile(undefined, XML + "\n", snapshot({ xml: engineXml }));

        expect(result.outcome).toBe("adopted");
    });

    it("never treats a missing recorded deploymentId as current", () => {
        const result = reconcile(
            recorded({ deploymentId: undefined }),
            "<edited/>",
            snapshot({ xml: "<different/>" }),
        );

        expect(result.outcome).toBe("superseded");
    });
});
