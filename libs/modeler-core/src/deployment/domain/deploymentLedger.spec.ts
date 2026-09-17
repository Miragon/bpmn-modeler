import { describe, expect, it } from "vitest";

import { DeploymentTarget } from "./deploymentTarget";
import {
    contentFingerprint,
    DeployedRevision,
    DeploymentTargetIdentity,
    freshnessFor,
    ledgerKeyFor,
} from "./deploymentLedger";

const target = (name: string): DeploymentTarget =>
    new DeploymentTarget(name, "c7", "http://localhost:8080/engine-rest", "", "none", "", "");

describe("contentFingerprint", () => {
    it("is stable across CRLF/LF differences", () => {
        expect(contentFingerprint("a\r\nb\rc")).toBe(contentFingerprint("a\nb\nc"));
    });

    it("differs for different content", () => {
        expect(contentFingerprint("<a/>")).not.toBe(contentFingerprint("<b/>"));
    });

    it("is 16 hex chars (64-bit)", () => {
        expect(contentFingerprint("anything")).toMatch(/^[0-9a-f]{16}$/);
    });
});

describe("DeploymentTargetIdentity", () => {
    it("keys a named target by name", () => {
        expect(DeploymentTargetIdentity.fromTarget(target("dev")).key()).toBe("target:dev");
    });

    it("keys ad-hoc mode by endpoint host + tenant, never the full URL", () => {
        const key = DeploymentTargetIdentity.adHoc(
            "https://camunda.example.com/engine-rest",
            "acme",
        ).key();
        expect(key).toBe("adhoc:camunda.example.com/acme");
        expect(key).not.toContain("engine-rest");
    });

    it("builds a per (target, file) ledger key", () => {
        const key = ledgerKeyFor(DeploymentTargetIdentity.fromTarget(target("dev")), "/a/x.bpmn");
        expect(key).toBe("target:dev::/a/x.bpmn");
    });
});

describe("freshnessFor", () => {
    const revision = (content: string): DeployedRevision => ({
        fingerprint: contentFingerprint(content),
        deployedAt: "2026-09-17T14:32:00.000Z",
    });

    it("is unknown with no recorded revision", () => {
        expect(freshnessFor(undefined, "<a/>")).toBe("unknown");
    });

    it("is deployed when content matches the recorded fingerprint", () => {
        expect(freshnessFor(revision("<a/>"), "<a/>")).toBe("deployed");
    });

    it("is changed when content differs", () => {
        expect(freshnessFor(revision("<a/>"), "<b/>")).toBe("changed");
    });

    it("stays deployed across EOL-only differences", () => {
        expect(freshnessFor(revision("a\nb"), "a\r\nb")).toBe("deployed");
    });
});
