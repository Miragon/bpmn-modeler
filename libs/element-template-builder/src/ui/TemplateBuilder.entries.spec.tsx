import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import {
    addGroup,
    addProperty,
    changePropertyType,
    duplicateProperty,
    moveProperty,
    removeGroup,
    removeProperty,
    renameGroup,
} from "../domain/transforms";
import { C8_SCHEMA, mountBuilder, type BuilderHarness } from "./__fixtures__/builderHarness";

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

describe("the template tab", () => {
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
        expect(builder.control("template-version")?.value).toBe("three");
    });
});

describe("the groups tab", () => {
    const grouped = () =>
        template([input({ group: "config" })], {
            groups: [{ id: "config", label: "Configuration" }],
        });

    it("adds, renames and removes groups", () => {
        const current = grouped();
        builder.show(current);
        builder.tab("Groups");

        builder.click(builder.buttonLabelled("Add group"));
        expect(lastEdits()).toEqual(addGroup(current));

        builder.typeInto("group-0-id", "settings");
        expect(lastEdits()).toEqual(renameGroup(current, 0, "settings"));

        builder.click(builder.action("Delete group"));
        expect(lastEdits()).toEqual(removeGroup(current, 0));
    });

    it("explains groups while there are none", () => {
        builder.show(template([input()]));
        builder.tab("Groups");

        expect(builder.parent.querySelector(".etb-index__empty")?.textContent).toBe(
            "No groups yet.",
        );
        expect(builder.parent.querySelector(".etb-empty")).not.toBeNull();
    });

    it("moves a property into a group", () => {
        builder.show(grouped());

        builder.choose("property-0-group", "");
        expect(lastEdits()).toEqual([{ kind: "remove", path: ["properties", 0, "group"] }]);
    });
});

describe("the properties tab", () => {
    const three = () => template([input(), input({ label: "Second" }), input({ label: "Third" })]);
    const selected = () => builder.parent.querySelector(".etb-index__item--selected")?.textContent;

    it("shows the property picked in the index", () => {
        builder.show(three());

        builder.pick(1);

        expect(selected()).toBe("Second");
        expect(builder.control("property-1-label")?.value).toBe("Second");
        expect(builder.entry("property-0-label")).toBeNull();
    });

    it("adds a property and selects it, ready for its label", () => {
        const current = three();
        builder.show(current);

        builder.click(builder.buttonLabelled("Add property"));
        expect(lastEdits()).toEqual(addProperty(current, C8));
        builder.show(template([...(current.properties as Json[]), input({ label: "New" })]));

        expect(selected()).toBe("New");
        const label = builder.control("property-3-label")!;
        expect(document.activeElement).toBe(label);
        expect([label.selectionStart, label.selectionEnd]).toEqual([0, "New".length]);
    });

    it.each([
        ["Duplicate property", 0, (current: Json) => duplicateProperty(current, 0), 1],
        ["Move down", 0, (current: Json) => moveProperty(current, 0, 1), 1],
        ["Move up", 2, (current: Json) => moveProperty(current, 2, 1), 1],
        ["Delete property", 2, () => removeProperty(2), 1],
    ])("selects where %s leaves the property", (action, from, edits, to) => {
        const current = three();
        builder.show(current);
        builder.pick(from);

        builder.click(builder.action(action));

        expect(lastEdits()).toEqual(edits(current));
        expect(builder.parent.querySelectorAll(".etb-index__item")[to]?.classList).toContain(
            "etb-index__item--selected",
        );
    });

    it("cannot move the first property up or the last one down", () => {
        builder.show(three());

        expect(builder.action("Move up")?.disabled).toBe(true);
        builder.pick(2);
        expect(builder.action("Move down")?.disabled).toBe(true);
    });

    it("asks for a first property in an empty template", () => {
        builder.show(template([]));
        builder.tab("Properties");

        expect(builder.parent.querySelector(".etb-index__empty")?.textContent).toBe(
            "No properties yet.",
        );
        expect(builder.parent.querySelector(".etb-empty")?.textContent).toBe(
            "Add a property for each field users fill in.",
        );
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
        builder.pick(1);
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
    const chip = () => builder.parent.querySelector<HTMLButtonElement>(".etb-problems__chip");
    const rows = () =>
        Array.from(builder.parent.querySelectorAll(".etb-problem"), (row) => row.textContent);

    it("sums them up in a chip like the modeler's lint summary, closed", () => {
        builder.show(template([input()]), {
            diagnostics: [
                { path: ["properties", 0, "label"], severity: "warning", message: "Label it." },
                { path: ["name"], severity: "error", message: "Name it." },
                { path: ["id"], severity: "warning", message: "Shorter." },
                { path: [], severity: "info", message: "Whole template." },
            ],
        });

        expect(chip()?.textContent).toBe("1 Errors, 2 Warnings");
        expect(chip()?.classList).toContain("etb-problems__chip--error");
        expect(chip()?.getAttribute("aria-expanded")).toBe("false");
        expect(rows()).toEqual([]);
    });

    it("says when there is nothing to fix", () => {
        builder.show(template([input()]));

        expect(chip()?.textContent).toBe("No Issues");
        expect(chip()?.classList).toContain("etb-problems__chip--success");
        expect(chip()?.disabled).toBe(true);
    });

    it("opens the list from the chip, errors first, and closes it again", () => {
        builder.show(template([input()]), {
            diagnostics: [
                { path: [], severity: "info", message: "Whole template." },
                { path: ["properties", 0, "label"], severity: "warning", message: "Label it." },
                { path: ["name"], severity: "error", message: "Name it." },
            ],
        });

        builder.click(chip());
        expect(chip()?.getAttribute("aria-expanded")).toBe("true");
        expect(rows()).toEqual(["Name it.Show", "In: Label it.Show", "Whole template."]);

        builder.click(chip());
        expect(rows()).toEqual([]);
    });

    it("leads from a problem to its field and stays open", () => {
        builder.show(template([input()]), {
            diagnostics: [{ path: ["properties", 0], severity: "warning", message: "Deprecated." }],
        });
        builder.click(chip());

        builder.click(builder.buttonLabelled("Show"));

        expect(rows()).toEqual(["In: Deprecated.Show"]);
        expect(builder.entry("property-0-label")?.textContent).toContain("Deprecated.");
    });
});

describe("showing a problem", () => {
    it("opens the tab and the property it is about and focuses its field", () => {
        builder.show(template([input(), input({ label: "Second" })]), {
            diagnostics: [
                { path: ["name"], severity: "error", message: "Name it." },
                { path: ["properties", 1, "label"], severity: "warning", message: "Label it." },
            ],
        });
        builder.click(builder.parent.querySelector(".etb-problems__chip"));

        builder.click(builder.parent.querySelectorAll(".etb-problem .etb-link")[0]);
        expect(document.activeElement).toBe(builder.control("template-name"));

        builder.click(builder.parent.querySelectorAll(".etb-problem .etb-link")[1]);
        expect(document.activeElement).toBe(builder.control("property-1-label"));
    });
});

describe("the index", () => {
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

        expect(builder.parent.querySelector(".etb-index__label")?.textContent).toBe(title);
    });

    it("marks a property with the worst of its problems", () => {
        builder.show(template([input(), input({ label: "Second" })]), {
            diagnostics: [
                { path: ["properties", 1, "label"], severity: "warning", message: "Label it." },
                { path: ["properties", 1, "type"], severity: "error", message: "Bad type." },
            ],
        });

        const items = builder.parent.querySelectorAll(".etb-index__item");
        expect(items[0].querySelector(".etb-icon")).toBeNull();
        expect(items[1].querySelector(".etb-icon--error")).not.toBeNull();
    });
});

describe("the settings", () => {
    const title = (id: string) =>
        builder.entry(id)?.querySelector(".etb-setting__title")?.textContent;

    it("name what they belong to, as VS Code's settings do", () => {
        builder.show(template([input()]));

        expect(title("property-0-label")).toBe("In: Label");
        builder.tab("Template");
        expect(title("template-name")).toBe("Template: Name");
    });

    it("mark the values the JSON sets", () => {
        builder.show(template([input()]));

        expect(builder.entry("property-0-label")?.classList).toContain("etb-setting--modified");
        expect(builder.entry("property-0-tooltip")?.classList).not.toContain(
            "etb-setting--modified",
        );
    });
});

describe("the search", () => {
    const search = (text: string) =>
        builder.typeInto(builder.parent.querySelector("#etb-search")!, text);
    const labels = () =>
        Array.from(
            builder.parent.querySelectorAll(".etb-index__label"),
            (label) => label.textContent,
        );

    it("finds properties by label, id or what they bind to", () => {
        builder.show(
            template([
                input({ label: "Host", binding: { type: "zeebe:input", name: "HOST_NAME" } }),
                input({ label: "Port", id: "smtp-port" }),
            ]),
        );

        search("host_n");
        expect(labels()).toEqual(["Host"]);

        search("SMTP");
        expect(labels()).toEqual(["Port"]);

        search("nothing like it");
        expect(builder.parent.querySelector(".etb-index__empty")?.textContent).toBe(
            "No properties match your search.",
        );

        builder.click(builder.action("Clear search"));
        expect(labels()).toEqual(["Host", "Port"]);
    });

    it("narrows the template's settings to those that match", () => {
        builder.show(template([]));

        search("version");

        expect(builder.entry("template-version")).not.toBeNull();
        expect(builder.entry("template-name")).toBeNull();
        expect(builder.parent.querySelector(".etb-section")?.textContent).toBe("General");
    });
});

describe("the tabs", () => {
    it("count what they list and show the worst problem in them", () => {
        builder.show(template([input(), input()]), {
            diagnostics: [{ path: ["name"], severity: "warning", message: "Name it." }],
        });

        const tabs = builder.parent.querySelectorAll('[role="tab"]');
        expect(Array.from(tabs, (tab) => tab.textContent)).toEqual([
            "Template",
            "Groups0",
            "Properties2",
        ]);
        expect(tabs[0].querySelector(".etb-icon--warning")).not.toBeNull();
        expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    });
});
