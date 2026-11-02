import { describe, expect, it } from "vitest";

import { basenameOfUriString } from "./basenameOfUriString";

describe("basenameOfUriString", () => {
    it("returns the bare filename for a plain file URI", () => {
        expect(basenameOfUriString("file:///repo/sub/diagram.bpmn")).toBe("diagram.bpmn");
    });

    it("trims a query string so ref-annotated URIs still resolve", () => {
        expect(basenameOfUriString("file:///repo/diagram.bpmn?ref=HEAD")).toBe("diagram.bpmn");
    });

    it("trims a fragment", () => {
        expect(basenameOfUriString("file:///repo/diagram.bpmn#section")).toBe("diagram.bpmn");
    });

    it("URL-decodes percent-encoded characters", () => {
        expect(basenameOfUriString("file:///repo/my%20diagram.bpmn")).toBe("my diagram.bpmn");
    });
});
