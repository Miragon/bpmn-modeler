import { describe, expect, it } from "vitest";

import { hostOf, loggableHost } from "./http";

const UNPARSEABLE_OR_HOSTLESS_URLS = [
    ["an unparseable string", "not a url"],
    ["an unresolved env ref", "${env:MIRAGON_URL}"],
    ["an empty string", ""],
    ["a URL without a host", "mailto:ops@example.com"],
    ["a host:port without a scheme", "localhost:8080/engine-rest"],
];

describe("hostOf", () => {
    it("returns only the host of a URL, never its path or query", () => {
        expect(hostOf("https://camunda.example.com/engine-rest?token=abc")).toBe(
            "camunda.example.com",
        );
    });

    it("keeps an explicit port", () => {
        expect(hostOf("http://localhost:8080/engine-rest")).toBe("localhost:8080");
    });

    it("omits a scheme's default port", () => {
        expect(hostOf("https://camunda.example.com:443/engine-rest")).toBe("camunda.example.com");
    });

    it("strips userinfo", () => {
        expect(hostOf("https://admin:s3cret@camunda.example.com/engine-rest")).toBe(
            "camunda.example.com",
        );
    });

    it.each(UNPARSEABLE_OR_HOSTLESS_URLS)("is undefined for %s", (_desc, url) => {
        expect(hostOf(url)).toBeUndefined();
    });
});

describe("loggableHost", () => {
    it("logs the host[:port] of a URL", () => {
        expect(loggableHost("http://localhost:8080/engine-rest?token=abc")).toBe("localhost:8080");
    });

    it("strips userinfo so credentials never reach the log", () => {
        const logged = loggableHost("https://admin:s3cret@camunda.example.com/engine-rest");

        expect(logged).toBe("camunda.example.com");
        expect(logged).not.toContain("s3cret");
    });

    it.each(UNPARSEABLE_OR_HOSTLESS_URLS)("falls back to unknown-host for %s", (_desc, url) => {
        expect(loggableHost(url)).toBe("unknown-host");
    });
});
