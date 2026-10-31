import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import { addProperty, changeBindingType, fixRequirement } from "../domain/transforms";
import {
    C7_SCHEMA,
    C8_SCHEMA,
    mountBuilder,
    type BuilderHarness,
} from "./__fixtures__/builderHarness";

type Json = Record<string, unknown>;

const C8_TEMPLATE: Json = {
    $schema: C8_SCHEMA,
    name: "Status",
    id: "status",
    appliesTo: ["bpmn:ServiceTask"],
    properties: [
        {
            id: "mode",
            label: "Mode",
            type: "String",
            binding: { type: "zeebe:input", name: "mode" },
        },
        { label: "Status", type: "String", binding: { type: "zeebe:input", name: "status" } },
    ],
};

let builder: BuilderHarness;

beforeEach(() => {
    builder = mountBuilder();
});

afterEach(() => {
    builder.destroy();
});

describe("createTemplateBuilder", () => {
    it("turns typing into an edit of the template", () => {
        builder.show(C8_TEMPLATE);
        builder.tab("Template");

        builder.typeInto("template-name", "Renamed");

        expect(builder.onEdit).toHaveBeenLastCalledWith([
            { kind: "set", path: ["name"], value: "Renamed" },
        ]);
    });

    it("switches a property to another binding", () => {
        builder.show(C8_TEMPLATE);
        builder.pick(1);

        builder.choose("property-1-binding-type", "zeebe:taskHeader");

        expect(builder.onEdit).toHaveBeenLastCalledWith(
            changeBindingType(C8_TEMPLATE, catalogFor("c8"), 1, "zeebe:taskHeader"),
        );
    });

    it("adds a property", () => {
        builder.show(C8_TEMPLATE);

        builder.click(builder.buttonLabelled("Add property"));

        expect(builder.onEdit).toHaveBeenLastCalledWith(addProperty(C8_TEMPLATE, catalogFor("c8")));
    });

    it("lists problems and fixes one in a click", () => {
        const requirement = {
            kind: "binding" as const,
            binding: { type: "zeebe:userTask" },
            label: "a zeebe:userTask property",
        };
        builder.show(C8_TEMPLATE, {
            diagnostics: [
                {
                    path: ["properties", 1, "binding", "type"],
                    severity: "error",
                    message: "This binding needs a zeebe:userTask property.",
                    fix: { label: "Add it", requirement },
                },
            ],
        });

        builder.click(builder.parent.querySelector(".etb-problems__chip"));
        expect(builder.parent.textContent).toContain(
            "This binding needs a zeebe:userTask property.",
        );
        builder.click(builder.buttonLabelled("Add it"));

        expect(builder.onEdit).toHaveBeenLastCalledWith(
            fixRequirement(C8_TEMPLATE, catalogFor("c8"), requirement),
        );
    });

    it("shows a diagnostic at the field it concerns", () => {
        builder.show(C8_TEMPLATE, {
            diagnostics: [
                { path: ["name"], severity: "error", message: "Give the template a name." },
            ],
        });
        builder.tab("Template");

        expect(builder.entry("template-name")?.textContent).toContain("Give the template a name.");
    });

    it("lets nothing be edited while the JSON is broken", () => {
        builder.show(C8_TEMPLATE, { editable: false });

        expect(builder.control("property-0-label")?.disabled).toBe(true);
        expect(builder.buttonLabelled("Add property")).toBeUndefined();
        expect(builder.action("Delete property")).toBeNull();
        builder.tab("Template");
        expect(builder.control("template-name")?.disabled).toBe(true);
    });

    it("writes a condition on another property", () => {
        builder.show(C8_TEMPLATE);
        builder.pick(1);

        builder.click(builder.buttonLabelled("Add condition"));

        expect(builder.onEdit).toHaveBeenLastCalledWith([
            {
                kind: "set",
                path: ["properties", 1, "condition"],
                value: { property: "mode", equals: "" },
            },
        ]);
    });

    it("offers C8's property options only for C8 templates", () => {
        builder.show(
            {
                $schema: C7_SCHEMA,
                name: "Mail",
                id: "mail",
                appliesTo: ["bpmn:ServiceTask"],
                properties: [
                    {
                        label: "To",
                        type: "String",
                        binding: { type: "camunda:inputParameter", name: "to" },
                    },
                ],
            },
            { engine: "c7" },
        );

        expect(builder.entry("property-0-label")).not.toBeNull();
        expect(builder.entry("property-0-id")).toBeNull();
        expect(builder.entry("property-0-condition")).toBeNull();
    });

    it("names the keys it leaves to the JSON", () => {
        builder.show({ ...C8_TEMPLATE, icon: { contents: "data:," } });
        builder.tab("Template");

        expect(builder.entry("template-json-only")?.textContent).toContain("icon");
    });
});
