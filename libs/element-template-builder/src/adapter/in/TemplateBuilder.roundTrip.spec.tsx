import { afterEach, describe, expect, it } from "vitest";

import { C8_SCHEMA, mountFile } from "../../__fixtures__/builderHarness";

type Json = Record<string, unknown>;

const input = (extra: Json = {}): Json => ({
    label: "In",
    type: "String",
    binding: { type: "zeebe:input", name: "in" },
    ...extra,
});

const fileOf = (template: Json) =>
    `${JSON.stringify(
        {
            $schema: C8_SCHEMA,
            name: "T",
            id: "t",
            appliesTo: ["bpmn:ServiceTask"],
            ...template,
        },
        null,
        2,
    )}\n`;

let file: ReturnType<typeof mountFile> | undefined;

const open = (template: Json, tab?: string) => {
    file = mountFile(fileOf(template));
    if (tab) {
        file.tab(tab);
    }
    return file;
};

afterEach(() => {
    file?.destroy();
    file = undefined;
});

const properties = (template: Json) => template.properties as Json[];

describe("typing into a group's id", () => {
    const GROUPED = {
        groups: [
            { id: "a", label: "A" },
            { id: "ab", label: "AB" },
        ],
        properties: [input({ group: "a" }), input({ group: "ab", label: "Other" })],
    };

    it("does not merge a group into another while its new id passes through that one's", () => {
        const builder = open(GROUPED, "Groups");
        builder.pick(1);

        builder.backspace("group-1-id");
        builder.typeKeys("group-1-id", "c");

        const template = builder.template();
        expect(template.groups).toEqual([
            { id: "a", label: "A" },
            { id: "ac", label: "AB" },
        ]);
        expect(properties(template).map((property) => property.group)).toEqual(["a", "ac"]);
    });

    it("keeps a taken id in the field with a message and out of the file", () => {
        const builder = open(GROUPED, "Groups");
        builder.pick(1);

        builder.backspace("group-1-id");

        expect(builder.control("group-1-id")?.value).toBe("a");
        expect(builder.entry("group-1-id")?.textContent).toContain(
            'Another group already has the id "a".',
        );
        expect((builder.template().groups as Json[])[1].id).toBe("ab");
    });

    it("keeps an emptied id in the field and out of the file", () => {
        const builder = open({ groups: [{ id: "a", label: "A" }], properties: [] }, "Groups");

        builder.backspace("group-0-id");

        expect(builder.control("group-0-id")?.value).toBe("");
        expect(builder.entry("group-0-id")?.textContent).toContain("Enter an id.");
        expect((builder.template().groups as Json[])[0].id).toBe("a");
    });
});

describe("typing into a number field", () => {
    it("keeps the decimal point while a decimal is typed", () => {
        const builder = open({
            properties: [input({ type: "Number", binding: { type: "zeebe:input", name: "n" } })],
        });

        builder.typeKeys("property-0-value", "1.5");

        expect(properties(builder.template())[0].value).toBe(1.5);
        expect(builder.control("property-0-value")?.value).toBe("1.5");
    });

    it("keeps a trailing zero while a decimal is typed", () => {
        const builder = open({
            properties: [input({ type: "Number", binding: { type: "zeebe:input", name: "n" } })],
        });

        builder.typeKeys("property-0-value", "1.05");

        expect(properties(builder.template())[0].value).toBe(1.05);
    });

    it("shows the file's value again once the file says otherwise", () => {
        const builder = open({
            properties: [input({ type: "Number", binding: { type: "zeebe:input", name: "n" } })],
        });
        builder.typeKeys("property-0-value", "1.");

        builder.onEdit([{ kind: "set", path: ["properties", 0, "value"], value: 7 }]);

        expect(builder.control("property-0-value")?.value).toBe("7");
    });

    it("does not write a blank as zero", () => {
        const builder = open({
            properties: [input({ type: "Number", binding: { type: "zeebe:input", name: "n" } })],
        });

        builder.typeInto("property-0-value", " ");

        expect(properties(builder.template())[0]).not.toHaveProperty("value");
    });
});

describe("typing into a condition's value", () => {
    const CONDITIONAL = {
        properties: [
            input({ id: "mode", label: "Mode" }),
            input({
                id: "extra",
                label: "Extra",
                condition: { property: "mode", oneOf: [] },
            }),
        ],
    };
    const valueField = (builder: ReturnType<typeof mountFile>) =>
        builder.entry("property-1-condition")!.querySelector("input")!;

    it("lets a list be typed item by item", () => {
        const builder = open(CONDITIONAL);
        builder.pick(1);

        builder.typeKeys(valueField(builder), "a,b");

        expect(properties(builder.template())[1].condition).toEqual({
            property: "mode",
            oneOf: ["a", "b"],
        });
        expect(valueField(builder).value).toBe("a,b");
    });

    it("lets a decimal be typed for a number property", () => {
        const builder = open({
            properties: [
                input({ id: "size", label: "Size", type: "Number" }),
                input({ id: "extra", label: "Extra", condition: { property: "size", equals: 0 } }),
            ],
        });
        builder.pick(1);
        builder.typeInto(valueField(builder), "");

        builder.typeKeys(valueField(builder), "1.5");

        expect(properties(builder.template())[1].condition).toEqual({
            property: "size",
            equals: 1.5,
        });
    });

    it("offers yes and no for a boolean property instead of free text", () => {
        const builder = open({
            properties: [
                input({ id: "on", label: "On", type: "Boolean", value: false }),
                input({ id: "extra", label: "Extra", condition: { property: "on", equals: true } }),
            ],
        });
        builder.pick(1);
        const condition = builder.entry("property-1-condition")!;

        expect(condition.querySelector("input")).toBeNull();
        builder.choose(condition.querySelectorAll("select")[2], "false");

        expect(properties(builder.template())[1].condition).toEqual({
            property: "on",
            equals: false,
        });
    });
});
