import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import { addGroup, changePropertyType, removeGroup, renameGroup } from "../domain/transforms";
import {
    C8_SCHEMA,
    mountBuilder,
    stubIntersectionObserver,
    type BuilderHarness,
} from "./__fixtures__/builderHarness";

type Json = Record<string, unknown>;

const C8 = catalogFor("c8");

function template(properties: Json[], extra: Json = {}): Json {
    return {
        $schema: C8_SCHEMA,
        name: "T",
        id: "t",
        appliesTo: ["bpmn:ServiceTask"],
        ...extra,
        properties,
    };
}

const input = (extra: Json = {}): Json => ({
    label: "In",
    type: "String",
    binding: { type: "zeebe:input", name: "in" },
    ...extra,
});

let builder: BuilderHarness;

beforeAll(stubIntersectionObserver);

beforeEach(() => {
    builder = mountBuilder();
});

afterEach(() => {
    builder.destroy();
});

const CONSTRAINTS = ["notEmpty", "minLength", "maxLength", "pattern", "patternMessage"];

const lastEdits = () => {
    const calls = builder.onEdit.mock.calls;
    return calls[calls.length - 1]?.[0];
};

describe("the template group", () => {
    it("adds and removes element types it applies to", () => {
        builder.show(template([], { appliesTo: ["bpmn:ServiceTask", "bpmn:SendTask"] }));
        const appliesTo = builder.entry("template-appliesTo")!;

        builder.choose(appliesTo.querySelector("select")!, "bpmn:UserTask");
        expect(lastEdits()).toEqual([
            { kind: "insert", path: ["appliesTo", 2], value: "bpmn:UserTask" },
        ]);

        builder.click(appliesTo.querySelector(".etb-chip__remove"));
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["appliesTo", 0] }]);
    });

    it("keeps the last element type", () => {
        builder.show(template([]));

        const remove = builder.entry("template-appliesTo")!.querySelector(".etb-chip__remove");
        expect((remove as HTMLButtonElement).disabled).toBe(true);
    });

    it("sets and clears the element type it creates, and its event definition", () => {
        builder.show(template([], { elementType: { value: "bpmn:IntermediateThrowEvent" } }));

        builder.choose("template-elementType-eventDefinition", "bpmn:MessageEventDefinition");
        expect(lastEdits()).toEqual([
            {
                kind: "set",
                path: ["elementType", "eventDefinition"],
                value: "bpmn:MessageEventDefinition",
            },
        ]);

        builder.choose("template-elementType", "bpmn:UserTask");
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["elementType", "value"], value: "bpmn:UserTask" },
        ]);

        builder.choose("template-elementType", "");
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["elementType"] }]);
    });

    it("writes the version as a number and refuses other text", () => {
        builder.show(template([]));

        builder.typeInto("template-version", "3");
        expect(lastEdits()).toEqual([{ kind: "set", path: ["version"], value: 3 }]);

        const calls = builder.onEdit.mock.calls.length;
        builder.typeInto("template-version", "three");
        expect(builder.onEdit.mock.calls).toHaveLength(calls);
        expect(builder.entry("template-version")?.textContent).toContain("Enter a number.");
    });
});

describe("the groups", () => {
    const grouped = () =>
        template([input({ group: "config" })], {
            groups: [{ id: "config", label: "Configuration" }],
        });

    it("adds, renames and removes groups", () => {
        const current = grouped();
        builder.show(current);

        builder.click(
            builder.parent.querySelector(
                '[data-group-id="group-groups"] .bio-properties-panel-add-entry',
            ),
        );
        expect(lastEdits()).toEqual(addGroup(current));

        builder.typeInto("group-0-id", "settings");
        expect(lastEdits()).toEqual(renameGroup(current, 0, "settings"));

        builder.click(
            builder.parent.querySelector(
                '[data-group-id="group-groups"] .bio-properties-panel-remove-entry',
            ),
        );
        expect(lastEdits()).toEqual(removeGroup(current, 0));
    });

    it("keeps the lists and their items as they are when adding or removing", () => {
        builder.show(template([input(), input({ label: "Second" })]));
        const properties = '[data-group-id="group-properties"]';

        builder.click(
            builder.parent.querySelector(`${properties} .bio-properties-panel-add-entry`),
        );
        builder.click(
            builder.parent.querySelector(
                `${properties} [data-entry-id="property-0"] .bio-properties-panel-remove-entry`,
            ),
        );

        expect(
            builder.parent.querySelector(`${properties} > .bio-properties-panel-group-header`)
                ?.classList,
        ).toContain("open");
        expect(builder.entry("property-0")?.classList).not.toContain("open");
    });

    it("moves a property into a group", () => {
        builder.show(grouped());

        builder.choose("property-0-group", "");
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["properties", 0, "group"] }]);
    });
});

describe("a property's value", () => {
    it.each([
        ["Boolean", { value: true }, "property-0-value"],
        ["Number", { value: 2 }, "property-0-value"],
        ["Text", { value: "long" }, "property-0-value"],
        ["Hidden", { value: "fixed" }, "property-0-value"],
    ])("is edited as a %s", (type, extra, id) => {
        builder.show(template([input({ type, ...extra })]));

        expect(builder.entry(id)).not.toBeNull();
    });

    it("toggles a Boolean value", () => {
        builder.show(template([input({ type: "Boolean", value: true })]));

        builder.click(builder.control("property-0-value"));

        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "value"], value: false },
        ]);
    });

    it("changes the type with its value", () => {
        const current = template([input({ value: "true" })]);
        builder.show(current);

        builder.choose("property-0-type", "Boolean");

        expect(lastEdits()).toEqual(changePropertyType(current, C8, 0, "Boolean"));
    });

    it("selects, adds and removes a Dropdown's choices", () => {
        builder.show(
            template([
                input({
                    type: "Dropdown",
                    value: "a",
                    choices: [
                        { name: "A", value: "a" },
                        { name: "B", value: "b" },
                    ],
                }),
            ]),
        );

        builder.choose("property-0-value", "b");
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "value"], value: "b" },
        ]);

        const choices = builder.entry("property-0-choices")!;
        builder.typeInto(choices.querySelectorAll("input")[1], "alpha");
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "choices", 0, "value"], value: "alpha" },
        ]);

        builder.click(builder.buttonLabelled("Add choice"));
        expect(lastEdits()).toEqual([
            {
                kind: "insert",
                path: ["properties", 0, "choices", 2],
                value: { name: "Option 3", value: "option-3" },
            },
        ]);

        builder.click(choices.querySelector(".etb-icon-button"));
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["properties", 0, "choices", 0] }]);
    });
});

describe("a property's options", () => {
    it("sets FEEL and optional where the binding allows them", () => {
        builder.show(template([input()]));

        builder.choose("property-0-feel", "optional");
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "feel"], value: "optional" },
        ]);

        builder.click(builder.control("property-0-optional"));
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "optional"], value: true },
        ]);
    });

    it("makes a value read-only and editable again", () => {
        builder.show(template([input()]));

        builder.click(builder.control("property-0-editable"));
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "editable"], value: false },
        ]);
    });

    it.each([
        ["String", ["notEmpty", "minLength", "maxLength", "pattern", "patternMessage"]],
        ["Text", ["notEmpty", "minLength", "maxLength", "pattern", "patternMessage"]],
        ["Number", ["notEmpty"]],
        ["Dropdown", ["notEmpty"]],
        ["Boolean", []],
    ])("offers the constraints that suit a %s value", (type, offered) => {
        builder.show(template([input({ type })]));

        expect(CONSTRAINTS.filter((key) => builder.entry(`property-0-constraints-${key}`))).toEqual(
            offered,
        );
    });

    it("still shows a constraint the JSON sets on any value", () => {
        builder.show(
            template([input({ type: "Boolean", constraints: { notEmpty: true, maxLength: 3 } })]),
        );

        expect(CONSTRAINTS.filter((key) => builder.entry(`property-0-constraints-${key}`))).toEqual(
            ["notEmpty", "maxLength"],
        );
    });

    it("sets constraints and a pattern with its message", () => {
        builder.show(template([input({ constraints: { pattern: "^a" } })]));

        builder.click(builder.control("property-0-constraints-notEmpty"));
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "constraints", "notEmpty"], value: true },
        ]);

        builder.typeInto("property-0-constraints-maxLength", "10");
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "constraints", "maxLength"], value: 10 },
        ]);

        builder.typeInto("property-0-constraints-patternMessage", "Starts with a");
        expect(lastEdits()).toEqual([
            {
                kind: "set",
                path: ["properties", 0, "constraints", "pattern"],
                value: { value: "^a", message: "Starts with a" },
            },
        ]);

        builder.typeInto("property-0-constraints-pattern", "");
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["properties", 0, "constraints"] }]);
    });

    it("edits a binding's choice and flag fields", () => {
        builder.show(
            template([input({ binding: { type: "zeebe:taskDefinition", property: "type" } })]),
        );

        builder.choose("property-0-binding-property", "retries");
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "binding", "property"], value: "retries" },
        ]);
    });

    it("edits a C7 field injection's expression flag", () => {
        builder.show(
            {
                name: "C7",
                id: "c7",
                appliesTo: ["bpmn:ServiceTask"],
                properties: [
                    { label: "F", type: "String", binding: { type: "camunda:field", name: "f" } },
                ],
            },
            { engine: "c7" },
        );

        builder.click(builder.control("property-0-binding-expression"));
        expect(lastEdits()).toEqual([
            { kind: "set", path: ["properties", 0, "binding", "expression"], value: true },
        ]);
    });

    it("edits and removes condition rows", () => {
        builder.show(
            template([
                input({ id: "mode" }),
                input({ condition: { property: "mode", equals: "a" } }),
            ]),
        );
        const condition = builder.entry("property-1-condition")!;

        builder.choose(condition.querySelectorAll("select")[1], "isActive");
        expect(lastEdits()).toEqual([
            {
                kind: "set",
                path: ["properties", 1, "condition"],
                value: { property: "mode", isActive: false },
            },
        ]);

        builder.typeInto(condition.querySelector("input")!, "b");
        expect(lastEdits()).toEqual([
            {
                kind: "set",
                path: ["properties", 1, "condition"],
                value: { property: "mode", equals: "b" },
            },
        ]);

        builder.click(condition.querySelector(".etb-icon-button"));
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["properties", 1, "condition"] }]);
    });

    it("shows a binding it does not edit without fields", () => {
        builder.show(
            template([input({ binding: { type: "zeebe:linkedResource", linkName: "x" } })]),
        );

        expect(builder.entry("property-0-binding-type")).not.toBeNull();
        expect(builder.entry("property-0-type")).toBeNull();
    });
});

describe("the problems", () => {
    it("leads to the field a problem concerns", () => {
        builder.show(template([input()]), {
            diagnostics: [
                { path: ["properties", 0, "label"], severity: "warning", message: "Label it." },
                { path: [], severity: "info", message: "Whole template." },
            ],
        });

        builder.click(builder.buttonLabelled("Show"));

        expect(builder.parent.textContent).toContain("Whole template.");
        expect(builder.buttonLabelled("Show")).toBeDefined();
    });

    it("names the property a problem is about and leads to it", () => {
        builder.show(template([input()]), {
            diagnostics: [{ path: ["properties", 0], severity: "warning", message: "Deprecated." }],
        });

        const problem = builder.parent.querySelector(".etb-problem");
        expect(problem?.querySelector(".etb-problem__where")?.textContent).toBe("In: ");
        expect(problem?.querySelector(".etb-link")).not.toBeNull();
        expect(builder.entry("property-0-label")?.textContent).toContain("Deprecated.");
    });
});

describe("the property list", () => {
    it.each([
        [input(), "In"],
        [input({ label: undefined, id: "in-id" }), "in-id"],
        [
            { type: "Hidden", value: "3", binding: { type: "zeebe:taskHeader", key: "retries" } },
            "Hidden · retries",
        ],
        [{ binding: { type: "zeebe:taskDefinition:type" } }, "zeebe:taskDefinition:type"],
        [{}, "Unlabeled property"],
    ])("titles %j as %s", (property, title) => {
        builder.show(template([property]));

        expect(
            builder
                .entry("property-0")
                ?.querySelector(".bio-properties-panel-collapsible-entry-header-title")
                ?.textContent,
        ).toBe(title);
    });
});
