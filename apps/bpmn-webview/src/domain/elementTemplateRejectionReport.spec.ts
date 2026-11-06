import { describe, expect, it } from "vitest";

import { elementTemplateRejectionReport } from "./elementTemplateRejectionReport";

describe("elementTemplateRejectionReport", () => {
    it.each([
        ["no errors", []],
        ["a missing error list", undefined],
    ])("reports nothing for %s", (_case, errors) => {
        expect(elementTemplateRejectionReport(errors)).toEqual({ logLines: [], notice: undefined });
    });

    it("logs a single rejection and announces it once", () => {
        expect(elementTemplateRejectionReport([new Error("bad id")])).toEqual({
            logLines: ["Element template rejected: bad id"],
            notice: "An element template was rejected and is ignored. See the log for details.",
        });
    });

    it("logs every rejection and announces their count", () => {
        expect(elementTemplateRejectionReport([new Error("bad"), "worse"])).toEqual({
            logLines: ["Element template rejected: bad", "Element template rejected: worse"],
            notice: "2 element templates were rejected and are ignored. See the log for details.",
        });
    });
});
