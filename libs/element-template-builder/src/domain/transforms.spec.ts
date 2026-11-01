import { describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import { applyTemplateEdits, type TemplateEdit } from "./templateText";
import {
    addChoice,
    addGroup,
    addProperty,
    changeBindingField,
    changeBindingType,
    changePropertyType,
    duplicateProperty,
    fixRequirement,
    moveProperty,
    removeChoice,
    removeGroup,
    removeProperty,
    renameGroup,
    setConstraint,
    setField,
    updateChoice,
} from "./transforms";

type Json = Record<string, unknown>;

const C7 = catalogFor("c7");
const C8 = catalogFor("c8");

function c8Template(properties: Json[] = [], extra: Json = {}): Json {
    return {
        $schema:
            "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
        name: "Status",
        id: "status",
        appliesTo: ["bpmn:ServiceTask"],
        ...extra,
        properties,
    };
}

/** Applies the edits to the template's text and parses the result back. */
function edited(template: Json, edits: TemplateEdit[]): Json {
    return JSON.parse(applyTemplateEdits(JSON.stringify(template, null, 2), [], edits));
}

const input = (extra: Json = {}): Json => ({
    label: "Status",
    type: "String",
    binding: { type: "zeebe:input", name: "status" },
    ...extra,
});

describe("setField", () => {
    it("sets a value", () => {
        expect(edited(c8Template(), setField(["name"], "Renamed")).name).toBe("Renamed");
    });

    it.each([
        ["an empty text", ""],
        ["nothing", undefined],
    ])("removes the key for %s", (_, value) => {
        const template = c8Template([], { description: "Old" });

        expect(edited(template, setField(["description"], value))).not.toHaveProperty(
            "description",
        );
    });

    it("leaves a key that is already missing alone", () => {
        expect(setField(["description"], undefined, c8Template())).toEqual([]);
    });
});

describe("properties", () => {
    it("adds a property with the engine's default binding", () => {
        expect(edited(c8Template(), addProperty(c8Template(), C8)).properties).toEqual([
            {
                label: "New property",
                type: "String",
                binding: { type: "zeebe:input", name: "input" },
            },
        ]);
        expect(
            edited({ name: "x", properties: [] }, addProperty({ name: "x", properties: [] }, C7))
                .properties,
        ).toEqual([
            {
                label: "New property",
                type: "String",
                binding: { type: "camunda:inputParameter", name: "input" },
            },
        ]);
    });

    it("creates the properties list when there is none", () => {
        const template: Json = { name: "x" };

        expect((edited(template, addProperty(template, C8)).properties as Json[]).length).toBe(1);
    });

    it("leaves a property moved onto itself where it is", () => {
        expect(moveProperty(c8Template([input()]), 0, 0)).toEqual([]);
    });

    it("removes, duplicates and moves properties", () => {
        const template = c8Template([input({ label: "A" }), input({ label: "B", id: "b" })]);
        const labels = (t: Json) => (t.properties as Json[]).map((p) => p.label);

        expect(labels(edited(template, removeProperty(0)))).toEqual(["B"]);
        expect(labels(edited(template, moveProperty(template, 1, 0)))).toEqual(["B", "A"]);
        const duplicated = edited(template, duplicateProperty(template, 1));
        expect(labels(duplicated)).toEqual(["A", "B", "B (copy)"]);
        expect((duplicated.properties as Json[])[2].id).toBe("b-copy");
    });
});

describe("changeBindingType", () => {
    it("starts the new binding from its catalog defaults", () => {
        const template = c8Template([input()]);

        const property = (
            edited(template, changeBindingType(template, C8, 0, "zeebe:taskHeader"))
                .properties as Json[]
        )[0];

        expect(property.binding).toEqual({ type: "zeebe:taskHeader", key: "header" });
        expect(property.type).toBe("String");
    });

    it("keeps a name the new binding also has", () => {
        const template = c8Template([input()]);

        const property = (
            edited(template, changeBindingType(template, C8, 0, "zeebe:property"))
                .properties as Json[]
        )[0];

        expect(property.binding).toEqual({ type: "zeebe:property", name: "status" });
    });

    it("drops what the new binding does not allow", () => {
        const template = c8Template([
            input({ type: "Number", value: 3, optional: true, feel: "optional" }),
        ]);

        const property = (
            edited(template, changeBindingType(template, C8, 0, "zeebe:userTask"))
                .properties as Json[]
        )[0];

        expect(property).toEqual({
            label: "Status",
            type: "Hidden",
            value: "3",
            binding: { type: "zeebe:userTask" },
        });
    });

    it("marks a value that must be FEEL", () => {
        const template = c8Template([input()]);

        const property = (
            edited(template, changeBindingType(template, C8, 0, "zeebe:script"))
                .properties as Json[]
        )[0];

        expect(property.feel).toBe("required");
    });
});

describe("a binding the catalog does not know", () => {
    const linked = input({ binding: { type: "zeebe:linkedResource", linkName: "a" } });

    it("is not switched to", () => {
        expect(changeBindingType(c8Template([input()]), C8, 0, "zeebe:unknown")).toEqual([]);
    });

    it("keeps its other keys when one field changes", () => {
        const template = c8Template([linked]);

        const result = edited(template, changeBindingField(template, C8, 0, "linkName", "b"));

        expect((result.properties as Json[])[0].binding).toEqual({
            type: "zeebe:linkedResource",
            linkName: "b",
        });
    });

    it("changes only the type when the property's type changes", () => {
        const template = c8Template([linked]);

        const result = edited(template, changePropertyType(template, C8, 0, "Text"));

        expect((result.properties as Json[])[0]).toEqual({ ...linked, type: "Text" });
    });
});

describe("changeBindingField", () => {
    it("applies the rules of the variant it selects", () => {
        const template = c8Template([
            input({ binding: { type: "zeebe:calledElement", property: "processId" } }),
        ]);

        const property = (
            edited(
                template,
                changeBindingField(template, C8, 0, "property", "propagateAllChildVariables"),
            ).properties as Json[]
        )[0];

        expect(property.binding).toEqual({
            type: "zeebe:calledElement",
            property: "propagateAllChildVariables",
        });
        expect(property.type).toBe("Hidden");
    });

    it("removes an emptied optional field", () => {
        const template = c8Template([
            input({ binding: { type: "zeebe:input", name: "status", extra: "x" } }),
        ]);

        const property = (
            edited(template, changeBindingField(template, C8, 0, "extra", "")).properties as Json[]
        )[0];

        expect(property.binding).toEqual({ type: "zeebe:input", name: "status" });
    });
});

describe("changePropertyType", () => {
    const typeChange = (from: Json, type: string) => {
        const template = c8Template([input(from)]);
        return (
            edited(template, changePropertyType(template, C8, 0, type)).properties as Json[]
        )[0];
    };

    it.each([
        ["Boolean", { value: "true" }, { type: "Boolean", value: true }],
        ["Boolean", { value: "no" }, { type: "Boolean", value: false }],
        ["Number", { value: "42" }, { type: "Number", value: 42 }],
        ["Number", { value: "many" }, { type: "Number" }],
        ["String", { type: "Boolean", value: true }, { type: "String", value: "true" }],
        ["Hidden", { placeholder: "Type", feel: "optional" }, { type: "Hidden" }],
    ])("turns the value into a %s", (type, from, expected) => {
        const property = typeChange(from, type);

        for (const [key, value] of Object.entries(expected)) {
            expect(property[key]).toEqual(value);
        }
        if (!("value" in expected)) {
            expect(property).not.toHaveProperty("value");
        }
        if (type === "Hidden") {
            expect(property).not.toHaveProperty("placeholder");
            expect(property).not.toHaveProperty("feel");
        }
    });

    it("keeps a number and a Dropdown's choices", () => {
        expect(typeChange({ type: "Hidden", value: 3 }, "Number")).toMatchObject({ value: 3 });
        expect(
            typeChange(
                { type: "Hidden", value: "b", choices: ["junk", { name: "B", value: "b" }] },
                "Dropdown",
            ),
        ).toMatchObject({ value: "b", choices: ["junk", { name: "B", value: "b" }] });
    });

    it("gives a Dropdown a first choice and selects it", () => {
        expect(typeChange({ value: "open" }, "Dropdown")).toMatchObject({
            type: "Dropdown",
            value: "open",
            choices: [{ name: "open", value: "open" }],
        });
        expect(typeChange({}, "Dropdown")).toMatchObject({
            value: "option-1",
            choices: [{ name: "Option 1", value: "option-1" }],
        });
    });

    it("drops the choices when leaving a Dropdown", () => {
        const property = typeChange(
            { type: "Dropdown", value: "a", choices: [{ name: "A", value: "a" }] },
            "String",
        );

        expect(property).not.toHaveProperty("choices");
        expect(property.value).toBe("a");
    });
});

describe("choices", () => {
    const dropdown = () =>
        c8Template([input({ type: "Dropdown", value: "a", choices: [{ name: "A", value: "a" }] })]);
    const choicesOf = (t: Json) => (t.properties as Json[])[0].choices;

    it("adds, updates and removes a choice", () => {
        expect(choicesOf(edited(dropdown(), addChoice(dropdown(), 0)))).toEqual([
            { name: "A", value: "a" },
            { name: "Option 2", value: "option-2" },
        ]);
        expect(choicesOf(edited(dropdown(), updateChoice(0, 0, "name", "Alpha")))).toEqual([
            { name: "Alpha", value: "a" },
        ]);
        expect(choicesOf(edited(dropdown(), removeChoice(0, 0)))).toEqual([]);
    });
});

describe("groups", () => {
    const grouped = () =>
        c8Template([input({ group: "config" }), input({ label: "Other" })], {
            groups: [{ id: "config", label: "Configuration" }],
        });

    it("adds a group with an unused id", () => {
        const template = grouped();

        expect(edited(template, addGroup(template)).groups).toEqual([
            { id: "config", label: "Configuration" },
            { id: "group-2", label: "New group" },
        ]);
    });

    it("renames a group and the properties in it", () => {
        const template = grouped();

        const result = edited(template, renameGroup(template, 0, "settings"));

        expect(result.groups).toEqual([{ id: "settings", label: "Configuration" }]);
        expect((result.properties as Json[]).map((p) => p.group)).toEqual(["settings", undefined]);
    });

    it("removes a group and moves its properties out of it", () => {
        const template = grouped();

        const result = edited(template, removeGroup(template, 0));

        expect(result.groups).toEqual([]);
        expect((result.properties as Json[])[0]).not.toHaveProperty("group");
    });
});

describe("entries that are not objects", () => {
    it("are passed over by the edits around them", () => {
        const template = c8Template(["junk" as unknown as Json, input()], {
            groups: ["junk", { id: "group-3", label: "Taken" }],
        });

        const result = edited(template, [...addGroup(template), ...removeProperty(1)]);

        expect(result.groups).toEqual([
            "junk",
            { id: "group-3", label: "Taken" },
            { id: "group-3-2", label: "New group" },
        ]);
        expect(changePropertyType(template, C8, 5, "Text")).toEqual([
            { kind: "set", path: ["properties", 5, "type"], value: "Text" },
        ]);
    });
});

describe("setConstraint", () => {
    it("adds a constraint and removes the object once it is empty", () => {
        const template = c8Template([input()]);

        const constrained = edited(template, setConstraint(template, 0, "notEmpty", true));
        expect((constrained.properties as Json[])[0].constraints).toEqual({ notEmpty: true });

        const cleared = edited(constrained, setConstraint(constrained, 0, "notEmpty", undefined));
        expect((cleared.properties as Json[])[0]).not.toHaveProperty("constraints");
    });

    it("keeps the other constraints when one is cleared", () => {
        const template = c8Template([input({ constraints: { notEmpty: true, maxLength: 5 } })]);

        const result = edited(template, setConstraint(template, 0, "maxLength", ""));

        expect((result.properties as Json[])[0].constraints).toEqual({ notEmpty: true });
    });
});

describe("fixRequirement", () => {
    it("sets the element type a binding needs", () => {
        const template = c8Template();

        const result = edited(
            template,
            fixRequirement(template, C8, {
                kind: "elementType",
                oneOf: [
                    {
                        value: "bpmn:IntermediateThrowEvent",
                        eventDefinition: "bpmn:MessageEventDefinition",
                    },
                ],
            }),
        );

        expect(result.elementType).toEqual({
            value: "bpmn:IntermediateThrowEvent",
            eventDefinition: "bpmn:MessageEventDefinition",
        });
        expect(result.appliesTo).toEqual(["bpmn:ServiceTask", "bpmn:IntermediateThrowEvent"]);
    });

    it("does not repeat an element type the template already applies to", () => {
        const template = c8Template([], { appliesTo: ["bpmn:UserTask"] });

        const result = edited(
            template,
            fixRequirement(template, C8, {
                kind: "elementType",
                oneOf: [{ value: "bpmn:UserTask" }],
            }),
        );

        expect(result.appliesTo).toEqual(["bpmn:UserTask"]);
    });

    it("adds a property with a binding the catalog does not know as it is named", () => {
        const template = c8Template();

        const result = edited(
            template,
            fixRequirement(template, C8, {
                kind: "binding",
                binding: { type: "zeebe:unknown", name: "x" },
                message: "This binding needs x.",
            }),
        );

        expect(result.properties).toEqual([
            { type: "Hidden", value: "", binding: { type: "zeebe:unknown", name: "x" } },
        ]);
    });

    it("adds the property a binding needs next to it", () => {
        const template = c8Template();

        const result = edited(
            template,
            fixRequirement(template, C8, {
                kind: "binding",
                binding: { type: "zeebe:userTask" },
                message: "This binding needs a zeebe:userTask property.",
            }),
        );

        expect(result.properties).toEqual([
            { type: "Hidden", value: "", binding: { type: "zeebe:userTask" } },
        ]);
    });
});
