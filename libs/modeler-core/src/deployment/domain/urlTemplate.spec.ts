import { describe, expect, it } from "vitest";

import { expandUrlTemplate, hostOf, loggableHost, stripTrailingSlash } from "./urlTemplate";

describe("expandUrlTemplate", () => {
    it("substitutes every occurrence of the process definition key", () => {
        expect(
            expandUrlTemplate("https://gw/{processDefinitionKey}/start/{processDefinitionKey}", {
                processDefinitionKey: "myProc",
            }),
        ).toBe("https://gw/myProc/start/myProc");
    });

    it("percent-encodes the key so it cannot escape its path segment", () => {
        expect(
            expandUrlTemplate("https://gw/{processDefinitionKey}/start", {
                processDefinitionKey: "a/b?c",
            }),
        ).toBe("https://gw/a%2Fb%3Fc/start");
    });

    it("leaves a template without the placeholder unchanged", () => {
        expect(expandUrlTemplate("https://gw/start", { processDefinitionKey: "x" })).toBe(
            "https://gw/start",
        );
    });
});

describe("stripTrailingSlash", () => {
    it("removes a single trailing slash", () => {
        expect(stripTrailingSlash("https://host/engine-rest/")).toBe("https://host/engine-rest");
    });

    it("leaves a slash-free endpoint unchanged", () => {
        expect(stripTrailingSlash("https://host/engine-rest")).toBe("https://host/engine-rest");
    });
});

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
