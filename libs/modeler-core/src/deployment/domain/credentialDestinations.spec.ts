import { describe, expect, it } from "vitest";

import { InvalidCredentialDestinationError } from "../../shared/domain/errors";

import { CredentialDestinations } from "./credentialDestinations";

const HOSTLESS_URLS = ["https://", "not a url", "file:///x", ""];

describe("CredentialDestinations", () => {
    describe("of", () => {
        it("reduces a URL to its origin, ignoring userinfo, path, query and fragment", () => {
            expect(
                CredentialDestinations.of("https://admin:s3cret@camunda.example/engine-rest?x=1#y")
                    .origins,
            ).toEqual(["https://camunda.example"]);
        });

        it("keeps a non-default port", () => {
            expect(CredentialDestinations.of("https://camunda.example:8443/x").origins).toEqual([
                "https://camunda.example:8443",
            ]);
        });

        it.each([
            ["https://camunda.example:443/x", "https://camunda.example"],
            ["http://camunda.example:80/x", "http://camunda.example"],
        ])("collapses the default port of %s", (url, origin) => {
            expect(CredentialDestinations.of(url).origins).toEqual([origin]);
        });

        it("treats http and https of the same host as different destinations", () => {
            const https = CredentialDestinations.of("https://camunda.example");
            const http = CredentialDestinations.of("http://camunda.example");

            expect(http.without(https).origins).toEqual(["http://camunda.example"]);
        });

        it("lowercases the host", () => {
            expect(CredentialDestinations.of("https://Camunda.EXAMPLE/x").origins).toEqual([
                "https://camunda.example",
            ]);
        });

        it.each(HOSTLESS_URLS)("throws for %j, which has no host to check", (url) => {
            expect(() => CredentialDestinations.of(url)).toThrow(InvalidCredentialDestinationError);
        });

        it("throws when any one of the URLs has no host", () => {
            expect(() => CredentialDestinations.of("https://camunda.example", "not a url")).toThrow(
                InvalidCredentialDestinationError,
            );
        });

        it("sorts and deduplicates origins", () => {
            expect(
                CredentialDestinations.of(
                    "https://zeebe.example/v2",
                    "https://auth.example/token",
                    "https://zeebe.example/v2/deployments",
                ).origins,
            ).toEqual(["https://auth.example", "https://zeebe.example"]);
        });
    });

    describe("ofKnown", () => {
        it.each(HOSTLESS_URLS)("skips %j instead of throwing", (url) => {
            expect(CredentialDestinations.ofKnown(url, "https://camunda.example").origins).toEqual([
                "https://camunda.example",
            ]);
        });

        it("skips a host only a request fills in, but keeps one templated in the path", () => {
            expect(
                CredentialDestinations.ofKnown(
                    "https://{processDefinitionKey}.example/start",
                    "https://gw.example/{processDefinitionKey}/start",
                ).origins,
            ).toEqual(["https://gw.example"]);
        });
    });

    describe("fromOrigins", () => {
        it("sorts and deduplicates", () => {
            expect(
                CredentialDestinations.fromOrigins([
                    "https://b.example",
                    "https://a.example",
                    "https://b.example",
                ]).origins,
            ).toEqual(["https://a.example", "https://b.example"]);
        });
    });

    describe("isEmpty", () => {
        it("is true only without origins", () => {
            expect(CredentialDestinations.none().isEmpty()).toBe(true);
            expect(CredentialDestinations.ofKnown("not a url").isEmpty()).toBe(true);
            expect(CredentialDestinations.of("https://camunda.example").isEmpty()).toBe(false);
        });
    });

    describe("without", () => {
        it("removes the origins of the other set", () => {
            const destinations = CredentialDestinations.fromOrigins([
                "https://a.example",
                "https://b.example",
                "https://c.example",
            ]);

            expect(
                destinations.without(
                    CredentialDestinations.fromOrigins(["https://b.example", "https://d.example"]),
                ).origins,
            ).toEqual(["https://a.example", "https://c.example"]);
        });
    });

    describe("union", () => {
        it("merges both sets sorted and deduplicated", () => {
            const left = CredentialDestinations.fromOrigins([
                "https://c.example",
                "https://a.example",
            ]);
            const right = CredentialDestinations.fromOrigins([
                "https://b.example",
                "https://a.example",
            ]);

            expect(left.union(right).origins).toEqual([
                "https://a.example",
                "https://b.example",
                "https://c.example",
            ]);
        });
    });

    describe("toString", () => {
        it("joins the origins with a comma", () => {
            expect(
                CredentialDestinations.fromOrigins([
                    "https://b.example",
                    "https://a.example",
                ]).toString(),
            ).toBe("https://a.example, https://b.example");
        });

        it("is empty for no origins", () => {
            expect(CredentialDestinations.none().toString()).toBe("");
        });
    });
});
