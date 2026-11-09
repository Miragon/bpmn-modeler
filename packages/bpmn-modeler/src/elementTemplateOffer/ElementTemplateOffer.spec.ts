import { describe, expect, it } from "vitest";

import { ElementTemplateOffer } from "./ElementTemplateOffer";
import { fakeElementTemplates } from "../__fixtures__/elementTemplates";

const REST_V1 = { id: "rest", version: 1, name: "REST" };
const REST_V2 = { id: "rest", version: 2, name: "REST" };
const MAIL = { id: "mail", name: "Mail" };

function offerOf(...templates: object[]) {
    return new ElementTemplateOffer(fakeElementTemplates(templates));
}

describe("ElementTemplateOffer", () => {
    it("offers every template until refs are hidden", () => {
        const offer = offerOf(REST_V2, MAIL);

        expect([offer.isOffered(REST_V2), offer.isOffered(MAIL)]).toEqual([true, true]);
    });

    it("keeps a hidden template out", () => {
        const offer = offerOf(REST_V2, MAIL);

        offer.setHidden([{ id: "mail" }]);

        expect([offer.isOffered(REST_V2), offer.isOffered(MAIL)]).toEqual([true, false]);
    });

    it("offers no older version in place of a hidden latest one", () => {
        const offer = offerOf(REST_V1, REST_V2);

        offer.setHidden([{ id: "rest", version: 2 }]);

        expect(offer.isOffered(REST_V1)).toBe(false);
        expect(offer.isTemplateIdOffered("rest")).toBe(false);
    });

    it("still offers the latest version when only an older one is hidden", () => {
        const offer = offerOf(REST_V1, REST_V2);

        offer.setHidden([{ id: "rest", version: 1 }]);

        expect(offer.isTemplateIdOffered("rest")).toBe(true);
        expect(offer.isOffered(REST_V2)).toBe(true);
    });

    it("replaces the previous set", () => {
        const offer = offerOf(REST_V2, MAIL);
        offer.setHidden([{ id: "mail" }]);

        offer.setHidden([{ id: "rest", version: 2 }]);

        expect([offer.isOffered(REST_V2), offer.isOffered(MAIL)]).toEqual([false, true]);
    });

    it("offers an id it does not know, and a template without an id", () => {
        const offer = offerOf(MAIL);
        offer.setHidden([{ id: "mail" }]);

        expect(offer.isTemplateIdOffered("unknown")).toBe(true);
        expect(offer.isOffered({ name: "anonymous" })).toBe(true);
    });
});
