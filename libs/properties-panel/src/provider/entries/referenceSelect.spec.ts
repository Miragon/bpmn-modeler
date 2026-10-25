import { afterEach, describe, expect, it, vi } from "vitest";

import { BPMN_NAMESPACES, renderPanel } from "../../__fixtures__/panelHarness";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN_NAMESPACES} id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:intermediateCatchEvent id="MessageCatch"><bpmn:messageEventDefinition id="MessageCatch_Def" /></bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="MessageCatch_Linked"><bpmn:messageEventDefinition id="MessageCatch_Linked_Def" messageRef="Message_1" /></bpmn:intermediateCatchEvent>
  </bpmn:process>
  <bpmn:message id="Message_1" name="Order placed" />
  <bpmn:message id="Message_2" name="Order shipped" />
</bpmn:definitions>`;

// jsdom's select() does not move focus, so the call itself is the observable.
const selectSpy = vi.spyOn(HTMLInputElement.prototype, "select");

afterEach(() => {
    selectSpy.mockClear();
});

describe("ReferenceSelect", () => {
    it("selects the new definition's name after Create new, ready to be typed over", async () => {
        const panel = await renderPanel(XML, "MessageCatch");

        await panel.selectOption("messageRef", "create-new");

        expect(selectSpy.mock.contexts).toEqual([panel.control("messageName")]);
    });

    it("leaves the focus alone when switching between existing definitions", async () => {
        const panel = await renderPanel(XML, "MessageCatch_Linked");

        await panel.selectOption("messageRef", "Message_2");

        expect(selectSpy).not.toHaveBeenCalled();
    });
});
