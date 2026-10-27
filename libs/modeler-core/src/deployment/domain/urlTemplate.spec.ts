import { describe, expect, it } from "vitest";

import { expandUrlTemplate, stripTrailingSlash } from "./urlTemplate";

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
