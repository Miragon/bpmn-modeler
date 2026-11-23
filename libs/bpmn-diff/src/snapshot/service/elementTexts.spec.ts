import { describe, expect, it } from "vitest";

import { KITCHEN_SINK_XML } from "../../__fixtures__/kitchen-sink";
import { isUnresolvedReferenceWarning } from "../../moddle/domain/bpmnModdleFactory";
import type { ModdleElement } from "../../moddle/domain/moddleElement";
import { createDocumentModdle } from "../../parse/service/documentModdle";
import { rebindReferences } from "../domain/rebindReferences";
import { elementSnapshots } from "./elementSnapshots";
import { elementTexts, standaloneElementText } from "./elementTexts";

const BPMN = 'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"';

async function parsedAlone(text: string, type: string) {
    const prefixedModdle = await createDocumentModdle([KITCHEN_SINK_XML]);
    const parsed = await prefixedModdle.moddle.fromXML(text, type);
    return { prefixedModdle, parsed };
}

describe("elementTexts", () => {
    it("writes each requested unit as elementSnapshots writes its content, in one parse", async () => {
        const snapshots = await elementSnapshots(KITCHEN_SINK_XML);
        const ids = [...snapshots.keys()];

        const texts = await elementTexts(KITCHEN_SINK_XML, ids);

        expect(Object.fromEntries(texts)).toEqual(
            Object.fromEntries(
                ids.map((id) => {
                    const { type, content } = snapshots.get(id)!;
                    return [id, { type, text: content }];
                }),
            ),
        );
    });

    it("leaves out an id that names no unit", async () => {
        const texts = await elementTexts(KITCHEN_SINK_XML, ["Nowhere"]);

        expect(texts.size).toBe(0);
    });

    it("cuts each unit to the own properties kept", async () => {
        const [id] = (await elementSnapshots(KITCHEN_SINK_XML)).keys();

        const texts = await elementTexts(KITCHEN_SINK_XML, [id!], {
            keepOwnProperty: (_unit, property) => property.name === "id",
        });

        expect(texts.get(id!)?.text).toMatch(new RegExp(`^<[^ ]+ [^>]*id="${id}"[^>]*/>$`));
        expect(texts.get(id!)?.text).not.toContain("name=");
    });

    it("rejects a document whose content the parser skips", async () => {
        const skipped = KITCHEN_SINK_XML.replace(
            "<bpmn:process ",
            "<undeclared:thing /><bpmn:process ",
        );

        await expect(elementTexts(skipped, [])).rejects.toThrow(/unparsable content/);
    });
});

describe("standaloneElementText", () => {
    it("writes an element parsed on its own as elementSnapshots writes its content", async () => {
        const snapshots = await elementSnapshots(KITCHEN_SINK_XML);
        // The diff's rule folds a pool's process into the participant, a second root.
        const oneRoot = [...snapshots.values()].filter(({ content }) => !content.includes("\n\n"));
        expect(oneRoot.length).toBeGreaterThan(10);
        for (const snapshot of oneRoot) {
            const { prefixedModdle, parsed } = await parsedAlone(snapshot.content, snapshot.type);
            rebindReferences(
                parsed.references ?? [],
                (id) =>
                    parsed.elementsById[id] ??
                    prefixedModdle.moddle.create("bpmn:BaseElement", { id }),
            );

            const text = await standaloneElementText(
                prefixedModdle,
                parsed.rootElement as ModdleElement & { id: string },
            );

            expect(text, snapshot.id).toBe(snapshot.content);
        }
    });
});

describe("rebindReferences", () => {
    const TASK = `<bpmn:task ${BPMN} id="Task_1">
  <bpmn:property id="Property_1" />
  <bpmn:dataInputAssociation>
    <bpmn:sourceRef>Outer_1</bpmn:sourceRef>
    <bpmn:sourceRef>Property_1</bpmn:sourceRef>
    <bpmn:sourceRef>Outer_2</bpmn:sourceRef>
    <bpmn:targetRef>Outer_3</bpmn:targetRef>
  </bpmn:dataInputAssociation>
</bpmn:task>`;

    it("sets every reference again in document order, an unresolved one where it stood", async () => {
        const { prefixedModdle, parsed } = await parsedAlone(TASK, "bpmn:Task");
        expect(parsed.warnings?.every(isUnresolvedReferenceWarning)).toBe(true);
        const stub = (id: string) => prefixedModdle.moddle.create("bpmn:BaseElement", { id });

        rebindReferences(parsed.references ?? [], (id) => parsed.elementsById[id] ?? stub(id));

        const [association] = parsed.rootElement.dataInputAssociations as ModdleElement[];
        expect((association!.sourceRef as ModdleElement[]).map(({ id }) => id)).toEqual([
            "Outer_1",
            "Property_1",
            "Outer_2",
        ]);
        expect((association!.sourceRef as ModdleElement[])[1]).toBe(
            parsed.elementsById["Property_1"],
        );
        expect((association!.targetRef as ModdleElement).id).toBe("Outer_3");
    });

    it("leaves out a reference nothing resolves", async () => {
        const { parsed } = await parsedAlone(TASK, "bpmn:Task");

        rebindReferences(parsed.references ?? [], () => undefined);

        const [association] = parsed.rootElement.dataInputAssociations as ModdleElement[];
        expect(association!.sourceRef).toBeUndefined();
        expect(association!.targetRef).toBeUndefined();
    });
});
