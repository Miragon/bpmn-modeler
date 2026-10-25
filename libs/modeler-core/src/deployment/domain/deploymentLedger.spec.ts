import { describe, expect, it } from "vitest";

import { CredentialRefs } from "./credentialRefs";
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

const unusableLookup = (): string | undefined => {
    throw new Error("the lookup must not be consulted");
};

const lookup = (map: Record<string, string>) => (name: string) => map[name];

const target = (name: string, endpoint = "http://localhost:8080/engine-rest"): DeploymentTarget =>
    new DeploymentTarget(name, "c7", endpoint, "", "none", "", "");

const FINGERPRINTED_TARGET_KEY = /^target:dev@env:[0-9a-f]{16}$/;

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
    describe("with a literal endpoint", () => {
        it("keys a named target by name and endpoint host, never the full URL", () => {
            const key = DeploymentTargetIdentity.fromTarget(target("dev"), noEnv).key();
            expect(key).toBe("target:dev@localhost:8080");
            expect(key).not.toContain("engine-rest");
        });

        it("changes the key when the target endpoint moves to a different host", () => {
            const moved = target("dev", "https://other.example.com/engine-rest");
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

        it.each([
            ["an unparseable endpoint", "not a url"],
            ["an endpoint without a host", "mailto:ops@example.com"],
        ])("falls back to the raw literal for %s", (_desc, endpoint) => {
            expect(DeploymentTargetIdentity.fromTarget(target("dev", endpoint), noEnv).key()).toBe(
                `target:dev@${endpoint}`,
            );
            expect(DeploymentTargetIdentity.adHoc(endpoint, "acme", noEnv).key()).toBe(
                `adhoc:${endpoint}/acme`,
            );
        });

        it("ignores the lookup", () => {
            const prodLookup = lookup({ MIRAGON_URL: "https://prod.example.com" });

            expect(DeploymentTargetIdentity.fromTarget(target("dev"), prodLookup).key()).toBe(
                "target:dev@localhost:8080",
            );
        });
    });

    describe("with env refs in the endpoint", () => {
        const viaEnv = target("dev", "${env:MIRAGON_URL}");
        const keyFor = (url: string) =>
            DeploymentTargetIdentity.fromTarget(viaEnv, lookup({ MIRAGON_URL: url })).key();

        it("persists a fingerprint, never the resolved host or its userinfo", () => {
            const key = keyFor("https://admin:s3cret@prod.example.com:8443/engine-rest");

            expect(key).toMatch(FINGERPRINTED_TARGET_KEY);
            for (const resolvedText of ["prod.example.com", "admin", "s3cret", "engine-rest"]) {
                expect(key).not.toContain(resolvedText);
            }
        });

        it("changes the key when the .env switches to another host", () => {
            expect(keyFor("http://dev:8080/engine-rest")).not.toBe(
                keyFor("https://prod.example.com/engine-rest"),
            );
        });

        it("keeps the key when only the path or userinfo of the resolved URL changes", () => {
            expect(keyFor("https://prod.example.com/engine-rest")).toBe(
                keyFor("https://user:other@prod.example.com/other-path"),
            );
        });

        it("keys a ref in the path only by the resolved host", () => {
            const viaPathRef = target("dev", "https://camunda.example.com/${env:MIRAGON_PATH}");
            const keyForPath = (path: string) =>
                DeploymentTargetIdentity.fromTarget(
                    viaPathRef,
                    lookup({ MIRAGON_PATH: path }),
                ).key();

            expect(keyForPath("engine-rest")).toMatch(FINGERPRINTED_TARGET_KEY);
            expect(keyForPath("engine-rest")).toBe(keyForPath("v2/engine-rest"));
            expect(keyForPath("engine-rest")).not.toContain("camunda.example.com");
        });

        it("keeps the name in the key so two targets on one host stay apart", () => {
            const prodLookup = lookup({ MIRAGON_URL: "https://prod.example.com" });
            const other = target("other", "${env:MIRAGON_URL}");

            expect(DeploymentTargetIdentity.fromTarget(viaEnv, prodLookup).key()).not.toBe(
                DeploymentTargetIdentity.fromTarget(other, prodLookup).key(),
            );
        });

        it("fingerprints an unresolved ref instead of throwing", () => {
            const key = DeploymentTargetIdentity.fromTarget(viaEnv, noEnv).key();

            expect(key).toMatch(FINGERPRINTED_TARGET_KEY);
            expect(key).not.toBe(keyFor("https://prod.example.com/engine-rest"));
        });

        it("never resolves a foreign ref, even when the lookup could", () => {
            const viaForeignEnv = target("dev", "${env:URL}");
            const foreignLookup = lookup({ URL: "https://prod.example.com/engine-rest" });

            const key = DeploymentTargetIdentity.fromTarget(viaForeignEnv, foreignLookup).key();

            expect(key).toMatch(FINGERPRINTED_TARGET_KEY);
            expect(key).toBe(DeploymentTargetIdentity.fromTarget(viaForeignEnv, noEnv).key());
        });
    });

    describe("in ad-hoc mode", () => {
        const endpoint = "https://camunda.example.com/engine-rest";

        it("fingerprints a tenant with refs and never persists its value", () => {
            const key = DeploymentTargetIdentity.adHoc(
                endpoint,
                "${env:MIRAGON_TENANT}",
                lookup({ MIRAGON_TENANT: "acme" }),
            ).key();

            expect(key).toMatch(/^adhoc:camunda\.example\.com\/env:[0-9a-f]{16}$/);
            expect(key).not.toContain("acme");
        });

        it("changes the key when the tenant variable changes", () => {
            const keyForTenant = (tenant: string) =>
                DeploymentTargetIdentity.adHoc(
                    endpoint,
                    "${env:MIRAGON_TENANT}",
                    lookup({ MIRAGON_TENANT: tenant }),
                ).key();

            expect(keyForTenant("acme")).not.toBe(keyForTenant("globex"));
            expect(keyForTenant("acme")).toBe(keyForTenant("acme"));
        });

        it("fingerprints both an endpoint and a tenant with refs", () => {
            const key = DeploymentTargetIdentity.adHoc(
                "${env:MIRAGON_URL}",
                "${env:MIRAGON_TENANT}",
                lookup({ MIRAGON_URL: endpoint, MIRAGON_TENANT: "acme" }),
            ).key();

            expect(key).toMatch(/^adhoc:env:[0-9a-f]{16}\/env:[0-9a-f]{16}$/);
            expect(key).not.toContain("camunda.example.com");
            expect(key).not.toContain("acme");
        });

        it("keeps a literal tenant verbatim next to an endpoint with refs", () => {
            const key = DeploymentTargetIdentity.adHoc(
                "${env:MIRAGON_URL}",
                "acme",
                lookup({ MIRAGON_URL: endpoint }),
            ).key();

            expect(key).toMatch(/^adhoc:env:[0-9a-f]{16}\/acme$/);
        });
    });

    describe("envRefsOfTarget", () => {
        const refsOf = (endpoint: string) =>
            DeploymentTargetIdentity.envRefsOfTarget(target("dev", endpoint)).referencesEnv();

        it.each([
            ["a whole ref", "${env:MIRAGON_URL}"],
            ["a ref in the path", "https://camunda.example.com/${env:MIRAGON_PATH}"],
            ["a malformed ref", "https://${env:"],
        ])("is true for an endpoint with %s", (_desc, endpoint) => {
            expect(refsOf(endpoint)).toBe(true);
        });

        it("is false for a literal endpoint", () => {
            expect(refsOf("http://localhost:8080/engine-rest")).toBe(false);
        });

        it("ignores refs in every field the key does not read", () => {
            const refsOutsideEndpoint = new DeploymentTarget(
                "dev",
                "c7",
                "http://localhost:8080/engine-rest",
                "${env:MIRAGON_TENANT}",
                "oauth2",
                "https://${env:MIRAGON_IDP}/token",
                "${env:MIRAGON_AUD}",
                "${env:MIRAGON_URL}/deploy",
                "${env:MIRAGON_URL}/start",
                CredentialRefs.oauth2("${env:MIRAGON_CLIENT_ID}", "${env:MIRAGON_CLIENT_SECRET}"),
            );

            expect(
                DeploymentTargetIdentity.envRefsOfTarget(refsOutsideEndpoint).referencesEnv(),
            ).toBe(false);
            expect(
                DeploymentTargetIdentity.fromTarget(refsOutsideEndpoint, unusableLookup).key(),
            ).toBe("target:dev@localhost:8080");
        });
    });

    describe("envRefsOfAdHoc", () => {
        const literalEndpoint = "https://camunda.example.com/engine-rest";

        it.each([
            ["the endpoint", "${env:MIRAGON_URL}", "acme"],
            ["the tenant", literalEndpoint, "${env:MIRAGON_TENANT}"],
            ["both fields", "${env:MIRAGON_URL}", "${env:MIRAGON_TENANT}"],
            ["a malformed tenant", literalEndpoint, "${env:"],
        ])("is true when %s holds a ref", (_desc, endpoint, tenantId) => {
            expect(
                DeploymentTargetIdentity.envRefsOfAdHoc(endpoint, tenantId).referencesEnv(),
            ).toBe(true);
        });

        it.each(["acme", ""])(
            "is false for a literal endpoint and tenant %j, which key without a lookup",
            (tenantId) => {
                expect(
                    DeploymentTargetIdentity.envRefsOfAdHoc(
                        literalEndpoint,
                        tenantId,
                    ).referencesEnv(),
                ).toBe(false);
                expect(
                    DeploymentTargetIdentity.adHoc(literalEndpoint, tenantId, unusableLookup).key(),
                ).toBe(`adhoc:camunda.example.com/${tenantId}`);
            },
        );
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
