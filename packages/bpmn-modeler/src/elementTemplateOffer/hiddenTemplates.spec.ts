import { describe, expect, it } from "vitest";

import { HiddenTemplates } from "./hiddenTemplates";

const REST_V1 = { id: "rest", version: 1 };
const REST_V2 = { id: "rest", version: 2 };
const MAIL = { id: "mail" };

describe("HiddenTemplates.offers", () => {
    it.each([
        ["nothing is hidden", [], REST_V2, REST_V2, true],
        ["the template is hidden", [REST_V2], REST_V2, REST_V2, false],
        ["another version is hidden", [REST_V1], REST_V2, REST_V2, true],
        ["the latest version of its id is hidden", [REST_V2], REST_V1, REST_V2, false],
        ["an older version is hidden and it is the latest", [REST_V1], REST_V1, REST_V1, false],
        ["an unversioned template is hidden", [MAIL], MAIL, MAIL, false],
        [
            "a versioned ref names an unversioned template",
            [{ id: "mail", version: 1 }],
            MAIL,
            MAIL,
            true,
        ],
        ["another id is hidden", [MAIL], REST_V2, REST_V2, true],
        ["its id is unknown to the index", [MAIL], REST_V2, undefined, true],
        ["it has no id", [MAIL], { name: "anonymous" }, undefined, true],
    ])("when %s", (_, refs, template, latestOfItsId, offered) => {
        expect(HiddenTemplates.of(refs).offers(template, latestOfItsId)).toBe(offered);
    });

    it("hides nothing by default", () => {
        expect(HiddenTemplates.NONE.offers(REST_V2, REST_V2)).toBe(true);
    });
});

describe("HiddenTemplates.offersTo an element", () => {
    it.each([
        ["it applies the hidden latest version", [MAIL], MAIL, MAIL, MAIL, true],
        [
            "it applies the hidden latest version with its version",
            [REST_V2],
            REST_V2,
            REST_V2,
            REST_V2,
            true,
        ],
        ["it applies another template", [MAIL], MAIL, MAIL, REST_V2, false],
        ["it applies no template", [MAIL], MAIL, MAIL, undefined, false],
        [
            "it applies an older version of a hidden latest one",
            [REST_V2],
            REST_V2,
            REST_V2,
            REST_V1,
            false,
        ],
        [
            "it applies the older version it is offered, behind a hidden latest one",
            [REST_V2],
            REST_V1,
            REST_V2,
            REST_V1,
            false,
        ],
        [
            "it applies the hidden template, which is not the latest version",
            [REST_V1],
            REST_V1,
            REST_V2,
            REST_V1,
            false,
        ],
        ["nothing is hidden", [], REST_V2, REST_V2, undefined, true],
        ["another template is hidden", [MAIL], REST_V2, REST_V2, MAIL, true],
        ["it applies a template without an id", [MAIL], MAIL, MAIL, { name: "anonymous" }, false],
    ])("when %s", (_, refs, template, latestOfItsId, applied, offered) => {
        expect(HiddenTemplates.of(refs).offersTo(template, latestOfItsId, applied)).toBe(offered);
    });
});
