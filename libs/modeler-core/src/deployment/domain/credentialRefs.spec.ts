import { describe, expect, it } from "vitest";

import { CredentialRefs } from "./credentialRefs";
import { BasicAuth, NoAuth, OAuth2Auth } from "./deployment";

const oauth2 = (clientId: string, clientSecret: string) =>
    new OAuth2Auth(clientId, clientSecret, "https://idp/token", "aud");

describe("CredentialRefs", () => {
    describe("factories", () => {
        it("holds no refs for none", () => {
            expect(CredentialRefs.none()).toMatchObject({
                username: undefined,
                password: undefined,
                clientId: undefined,
                clientSecret: undefined,
            });
        });

        it("holds only the basic fields for basic", () => {
            expect(CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PW}")).toMatchObject({
                username: "${env:MIRAGON_USER}",
                password: "${env:MIRAGON_PW}",
                clientId: undefined,
                clientSecret: undefined,
            });
        });

        it("holds only the client fields for oauth2", () => {
            expect(CredentialRefs.oauth2("${env:MIRAGON_CID}", "${env:MIRAGON_S}")).toMatchObject({
                username: undefined,
                password: undefined,
                clientId: "${env:MIRAGON_CID}",
                clientSecret: "${env:MIRAGON_S}",
            });
        });
    });

    describe("of", () => {
        it("takes the trimmed whole refs of basic credentials", () => {
            expect(
                CredentialRefs.of(new BasicAuth("  ${env:MIRAGON_USER} ", "${env:MIRAGON_PW}")),
            ).toEqual(CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PW}"));
        });

        it("takes the trimmed whole refs of oauth2 client credentials only", () => {
            const auth = new OAuth2Auth(
                "${env:MIRAGON_CID}",
                " ${env:MIRAGON_SECRET} ",
                "${env:MIRAGON_TOKEN_URL}",
                "${env:MIRAGON_AUD}",
            );

            expect(CredentialRefs.of(auth)).toEqual(
                CredentialRefs.oauth2("${env:MIRAGON_CID}", "${env:MIRAGON_SECRET}"),
            );
        });

        it("ignores literals, partial interpolation and foreign refs", () => {
            expect(CredentialRefs.of(new BasicAuth("admin", "x-${env:MIRAGON_PW}"))).toEqual(
                CredentialRefs.none(),
            );
            expect(CredentialRefs.of(oauth2("${env:CLIENT_ID}", "secret"))).toEqual(
                CredentialRefs.none(),
            );
        });

        it("is empty for NoAuth", () => {
            expect(CredentialRefs.of(new NoAuth())).toEqual(CredentialRefs.none());
        });
    });

    describe("admits", () => {
        const basicRefs = CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PW}");
        const oauth2Refs = CredentialRefs.oauth2("${env:MIRAGON_CID}", undefined);

        it("admits a request with the same refs, ignoring surrounding whitespace", () => {
            expect(
                basicRefs.admits(new BasicAuth("${env:MIRAGON_USER}", " ${env:MIRAGON_PW} ")),
            ).toBe(true);
            expect(oauth2Refs.admits(oauth2("${env:MIRAGON_CID}", "literal"))).toBe(true);
        });

        it("rejects a changed ref", () => {
            expect(
                basicRefs.admits(new BasicAuth("${env:MIRAGON_USER}", "${env:MIRAGON_OTHER}")),
            ).toBe(false);
            expect(oauth2Refs.admits(oauth2("${env:MIRAGON_OTHER}", "literal"))).toBe(false);
        });

        it("rejects a newly typed ref where the file has none", () => {
            expect(CredentialRefs.none().admits(new BasicAuth("admin", "${env:MIRAGON_PW}"))).toBe(
                false,
            );
            expect(oauth2Refs.admits(oauth2("${env:MIRAGON_CID}", "${env:MIRAGON_S}"))).toBe(false);
        });

        it("rejects a removed ref replaced by a literal", () => {
            expect(basicRefs.admits(new BasicAuth("${env:MIRAGON_USER}", "typed-secret"))).toBe(
                false,
            );
            expect(oauth2Refs.admits(oauth2("cid", "secret"))).toBe(false);
        });

        it("rejects refs saved for one auth type against a request of another", () => {
            expect(basicRefs.admits(oauth2("${env:MIRAGON_USER}", "${env:MIRAGON_PW}"))).toBe(
                false,
            );
            expect(basicRefs.admits(new NoAuth())).toBe(false);
        });

        it("admits literals that differ freely", () => {
            const refs = CredentialRefs.basic("${env:MIRAGON_USER}", undefined);

            expect(refs.admits(new BasicAuth("${env:MIRAGON_USER}", "old-secret"))).toBe(true);
            expect(refs.admits(new BasicAuth("${env:MIRAGON_USER}", "new-secret"))).toBe(true);
            expect(CredentialRefs.none().admits(new BasicAuth("admin", "secret"))).toBe(true);
            expect(CredentialRefs.none().admits(oauth2("cid", "secret"))).toBe(true);
        });

        it("treats a malformed or foreign ref like a literal, leaving it to validation", () => {
            expect(CredentialRefs.none().admits(new BasicAuth("${env:GITHUB_TOKEN}", "x"))).toBe(
                true,
            );
        });

        it("admits NoAuth when the file has no refs", () => {
            expect(CredentialRefs.none().admits(new NoAuth())).toBe(true);
        });
    });

    describe("isEmpty", () => {
        it.each([
            ["none", CredentialRefs.none()],
            ["basic without refs", CredentialRefs.basic(undefined, undefined)],
            ["oauth2 without refs", CredentialRefs.oauth2(undefined, undefined)],
        ])("is true for %s", (_desc, refs) => {
            expect(refs.isEmpty()).toBe(true);
        });

        it.each([
            ["a basic username ref", CredentialRefs.basic("${env:MIRAGON_USER}", undefined)],
            ["a basic password ref", CredentialRefs.basic(undefined, "${env:MIRAGON_PW}")],
            ["an oauth2 client id ref", CredentialRefs.oauth2("${env:MIRAGON_CID}", undefined)],
            ["an oauth2 client secret ref", CredentialRefs.oauth2(undefined, "${env:MIRAGON_S}")],
        ])("is false with %s", (_desc, refs) => {
            expect(refs.isEmpty()).toBe(false);
        });
    });

    describe("writeTo", () => {
        it("writes only the defined refs and keeps the other auth fields", () => {
            const auth: Record<string, unknown> = {
                type: "oauth2",
                tokenEndpoint: "https://idp/token",
            };

            CredentialRefs.oauth2("${env:MIRAGON_CID}", undefined).writeTo(auth);

            expect(auth).toEqual({
                type: "oauth2",
                tokenEndpoint: "https://idp/token",
                clientId: "${env:MIRAGON_CID}",
            });
        });

        it("writes both basic refs", () => {
            const auth: Record<string, unknown> = { type: "basic" };

            CredentialRefs.basic("${env:MIRAGON_USER}", "${env:MIRAGON_PW}").writeTo(auth);

            expect(auth).toEqual({
                type: "basic",
                username: "${env:MIRAGON_USER}",
                password: "${env:MIRAGON_PW}",
            });
        });

        it("writes nothing for no refs", () => {
            const auth: Record<string, unknown> = { type: "none" };

            CredentialRefs.none().writeTo(auth);

            expect(auth).toEqual({ type: "none" });
            expect(Object.keys(auth)).toEqual(["type"]);
        });
    });
});
