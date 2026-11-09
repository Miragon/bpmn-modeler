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

    it("offers no older version in place of a hidden latest version that is deprecated", () => {
        const offer = offerOf(REST_V1, { ...REST_V2, deprecated: true });

        offer.setHidden([{ id: "rest", version: 2 }]);

        expect(offer.isOffered(REST_V1)).toBe(false);
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

describe("ElementTemplateOffer to an element", () => {
    const usingMail = { type: "bpmn:Task", appliedTemplate: MAIL };

    it("still offers a hidden template to the element that already uses it", () => {
        const offer = offerOf(REST_V2, MAIL);

        offer.setHidden([{ id: "mail" }]);

        expect(offer.isTemplateIdOfferedTo(usingMail, "mail")).toBe(true);
        expect(offer.isTemplateIdOfferedTo({ type: "bpmn:Task" }, "mail")).toBe(false);
    });

    it("offers no hidden latest version to an element on an older one", () => {
        const offer = offerOf(REST_V1, REST_V2);

        offer.setHidden([{ id: "rest", version: 2 }]);

        expect(
            offer.isTemplateIdOfferedTo({ type: "bpmn:Task", appliedTemplate: REST_V1 }, "rest"),
        ).toBe(false);
    });

    it("offers an element whatever is offered to every element", () => {
        const offer = offerOf(REST_V2, MAIL);

        offer.setHidden([{ id: "mail" }]);

        expect(offer.isTemplateIdOfferedTo(usingMail, "rest")).toBe(true);
    });

    it("offers no hidden id to an element whose template is not loaded", () => {
        const offer = offerOf(REST_V2);

        offer.setHidden([{ id: "rest", version: 2 }]);

        expect(
            offer.isTemplateIdOfferedTo({ type: "bpmn:Task", appliedTemplate: MAIL }, "rest"),
        ).toBe(false);
    });
});

describe("ElementTemplateOffer default template", () => {
    const TASK = { type: "bpmn:Task" };
    const AUDIT = { id: "audit", appliesTo: ["bpmn:Task"], isDefault: true };
    const LOG = { id: "log", appliesTo: ["bpmn:Task"], isDefault: true };
    const PLAIN = { id: "plain", appliesTo: ["bpmn:Task"] };
    const FLOW_V1 = { id: "flow", version: 1, appliesTo: ["bpmn:Task"], isDefault: true };
    const FLOW_V2 = { id: "flow", version: 2, appliesTo: ["bpmn:Task"], isDefault: true };

    function guarded(...templates: object[]) {
        const elementTemplates = fakeElementTemplates(templates);
        const offer = new ElementTemplateOffer(elementTemplates);
        return { elementTemplates, offer };
    }

    it("still applies the default template nothing hides", () => {
        const { elementTemplates } = guarded(PLAIN, AUDIT);

        expect(elementTemplates.getDefault(TASK)).toBe(AUDIT);
    });

    it("applies no hidden default template", () => {
        const { elementTemplates, offer } = guarded(PLAIN, AUDIT);

        offer.setHidden([{ id: "audit" }]);

        expect(elementTemplates.getDefault(TASK)).toBeNull();
    });

    it("applies the next offered default template in upstream's order", () => {
        const { elementTemplates, offer } = guarded(AUDIT, LOG);

        offer.setHidden([{ id: "audit" }]);

        expect(elementTemplates.getDefault(TASK)).toBe(LOG);
    });

    it("applies no older version of a default template whose latest version is hidden", () => {
        const { elementTemplates, offer } = guarded(FLOW_V1, FLOW_V2);

        offer.setHidden([{ id: "flow", version: 2 }]);

        expect(elementTemplates.getDefault(TASK)).toBeNull();
    });

    it("follows a later change of the hidden set", () => {
        const { elementTemplates, offer } = guarded(AUDIT);
        offer.setHidden([{ id: "audit" }]);

        offer.setHidden([]);

        expect(elementTemplates.getDefault(TASK)).toBe(AUDIT);
    });

    it("leaves the lookups the properties panel reads unfiltered", () => {
        const { elementTemplates, offer } = guarded(AUDIT);

        offer.setHidden([{ id: "audit" }]);

        expect(elementTemplates.getAll(TASK)).toEqual([AUDIT]);
        expect(elementTemplates.getLatest(TASK)).toEqual([AUDIT]);
        expect(elementTemplates.getLatest("audit", { deprecated: true })).toEqual([AUDIT]);
    });
});
