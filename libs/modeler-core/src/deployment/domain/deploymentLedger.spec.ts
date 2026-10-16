import { describe, expect, it } from "vitest";

import { DeploymentTarget } from "./deploymentTarget";
import {
    contentFingerprint,
    DeployedRevision,
    DeploymentTargetIdentity,
    freshnessFor,
    ledgerKeyFor,
    ledgerKeyPrefixFor,
} from "./deploymentLedger";

const noEnv = () => undefined;

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
    it("keys a named target by name and endpoint host, never the full URL", () => {
        const key = DeploymentTargetIdentity.fromTarget(target("dev"), noEnv).key();
        expect(key).toBe("target:dev@localhost:8080");
        expect(key).not.toContain("engine-rest");
    });

    it("changes the key when the target endpoint moves to a different host", () => {
        const moved = new DeploymentTarget(
            "dev",
            "c7",
            "https://other.example.com/engine-rest",
            "",
            "none",
            "",
            "",
        );
        expect(DeploymentTargetIdentity.fromTarget(moved, noEnv).key()).toBe(
            "target:dev@other.example.com",
        );
    });

    it("keys ad-hoc mode by endpoint host + tenant, never the full URL", () => {
        const key = DeploymentTargetIdentity.adHoc(
            "https://camunda.example.com/engine-rest",
            "acme",
            noEnv,
        ).key();
        expect(key).toBe("adhoc:camunda.example.com/acme");
        expect(key).not.toContain("engine-rest");
    });

    it("keys an env-ref endpoint by the resolved host, so a .env switch changes the identity", () => {
        const viaEnv = new DeploymentTarget("dev", "c7", "${env:URL}", "", "none", "", "");
        const devKey = DeploymentTargetIdentity.fromTarget(viaEnv, (name) =>
            name === "URL" ? "http://dev:8080/engine-rest" : undefined,
        ).key();
        const prodKey = DeploymentTargetIdentity.fromTarget(viaEnv, (name) =>
            name === "URL" ? "https://prod.example.com/engine-rest" : undefined,
        ).key();
        expect(devKey).toBe("target:dev@dev:8080");
        expect(prodKey).toBe("target:dev@prod.example.com");
    });

    it("keeps an unresolved ref verbatim instead of throwing", () => {
        const viaEnv = new DeploymentTarget("dev", "c7", "${env:URL}", "", "none", "", "");
        expect(DeploymentTargetIdentity.fromTarget(viaEnv, noEnv).key()).toBe(
            "target:dev@${env:URL}",
        );
    });

    it("resolves env refs in the ad-hoc endpoint and tenant", () => {
        const key = DeploymentTargetIdentity.adHoc(
            "${env:URL}",
            "${env:TENANT}",
            (name) => ({ URL: "https://camunda.example.com/engine-rest", TENANT: "acme" })[name],
        ).key();
        expect(key).toBe("adhoc:camunda.example.com/acme");
    });

    it("builds a per (target, file) ledger key", () => {
        const key = ledgerKeyFor(
            DeploymentTargetIdentity.fromTarget(target("dev"), noEnv),
            "/a/x.bpmn",
        );
        expect(key).toBe("target:dev@localhost:8080::/a/x.bpmn");
    });

    it("builds the prune prefix covering every file of the identity", () => {
        const identity = DeploymentTargetIdentity.fromTarget(target("dev"), noEnv);
        expect(ledgerKeyPrefixFor(identity)).toBe("target:dev@localhost:8080::");
        expect(ledgerKeyFor(identity, "/a/x.bpmn").startsWith(ledgerKeyPrefixFor(identity))).toBe(
            true,
        );
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

    it("is superseded when content differs from an engine-origin revision", () => {
        expect(freshnessFor({ ...revision("<a/>"), origin: "engine" }, "<b/>")).toBe("superseded");
    });

    it("is deployed when content matches an engine-origin revision", () => {
        expect(freshnessFor({ ...revision("<a/>"), origin: "engine" }, "<a/>")).toBe("deployed");
    });

    it("treats an explicit local origin like an absent one", () => {
        expect(freshnessFor({ ...revision("<a/>"), origin: "local" }, "<b/>")).toBe("changed");
    });

    it("stays deployed across EOL-only differences", () => {
        expect(freshnessFor(revision("a\nb"), "a\r\nb")).toBe("deployed");
    });
});
