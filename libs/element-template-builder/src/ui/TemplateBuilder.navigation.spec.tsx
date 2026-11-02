import { act } from "@bpmn-io/properties-panel/preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    C7_SCHEMA,
    C8_SCHEMA,
    mountBuilder,
    type BuilderHarness,
} from "./__fixtures__/builderHarness";

type Json = Record<string, unknown>;

const input = (label: string, extra: Json = {}): Json => ({
    label,
    type: "String",
    binding: { type: "zeebe:input", name: label.toLowerCase() },
    ...extra,
});

const TEMPLATE: Json = {
    $schema: C8_SCHEMA,
    name: "Mail",
    id: "mail",
    appliesTo: ["bpmn:ServiceTask"],
    groups: [{ id: "auth", label: "Authentication" }],
    properties: [input("Host"), input("Port"), input("Password", { group: "auth" })],
};

let builder: BuilderHarness;

beforeEach(() => {
    builder = mountBuilder();
});

afterEach(() => {
    builder.destroy();
});

const search = (query: string) =>
    builder.typeInto(builder.parent.querySelector(".etb-search__input")!, query);
const heading = () => builder.parent.querySelector(".etb-heading__title")?.textContent;
const indexTitles = () =>
    Array.from(builder.parent.querySelectorAll(".etb-index__label"), (label) => label.textContent);
const tabCount = (id: string) =>
    builder.parent.querySelector(`#etb-tab-${id} .etb-count`)?.textContent;

describe("searching", () => {
    it("shows a match instead of the selected property the search hides", () => {
        builder.show(TEMPLATE);
        expect(heading()).toBe("Host");

        search("password");

        expect(indexTitles()).toEqual(["Password"]);
        expect(heading()).toBe("Password");
    });

    it("goes back to the selected property when the search is cleared", () => {
        builder.show(TEMPLATE);
        builder.pick(1);
        search("password");

        search("");

        expect(heading()).toBe("Port");
    });

    it("shows how many matches each tab has", () => {
        builder.show(TEMPLATE);
        expect(tabCount("properties")).toBe("3");
        expect(tabCount("template")).toBeUndefined();

        search("pass");
        expect(tabCount("properties")).toBe("1");
        expect(tabCount("groups")).toBe("0");
        expect(tabCount("template")).toBe("0");

        search("auth");
        expect(tabCount("properties")).toBe("0");
        expect(tabCount("groups")).toBe("1");
    });

    it("points from a tab without matches to the tabs that have some", () => {
        builder.show(TEMPLATE);
        builder.tab("Template");

        search("password");

        expect(builder.parent.textContent).toContain("No settings match your search.");
        builder.click(builder.buttonLabelled("1 in Properties"));
        expect(heading()).toBe("Password");
    });

    it("points elsewhere from the properties and groups tabs too", () => {
        builder.show(TEMPLATE);

        search("authentication");
        expect(builder.buttonLabelled("1 in Groups")).toBeDefined();
        expect(heading()).toBeUndefined();

        builder.click(builder.buttonLabelled("1 in Groups"));
        expect(heading()).toBe("Authentication");

        search("password");
        expect(builder.buttonLabelled("1 in Properties")).toBeDefined();
    });

    it("says nothing about other tabs when nothing matches anywhere", () => {
        builder.show(TEMPLATE);

        search("nothing like this");

        expect(builder.parent.querySelector(".etb-other-matches")).toBeNull();
        expect(builder.parent.textContent).toContain("No properties match your search.");
    });
});

describe("the problems list", () => {
    const WITH_PROBLEM = {
        diagnostics: [
            {
                path: ["properties", 1, "label"],
                severity: "error" as const,
                message: "Wrong",
            },
        ],
    };
    const chip = () => builder.parent.querySelector(".etb-problems__chip");
    const list = () => builder.parent.querySelector(".etb-problems__list");
    const press = (key: string) =>
        act(() => {
            chip()!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
        });

    it("closes on Escape", () => {
        builder.show(TEMPLATE, WITH_PROBLEM);
        builder.click(chip());
        expect(list()).not.toBeNull();

        press("Enter");
        expect(list()).not.toBeNull();

        press("Escape");
        expect(list()).toBeNull();
    });

    it("closes when the user switches the tab", () => {
        builder.show(TEMPLATE, WITH_PROBLEM);
        builder.click(chip());

        builder.tab("Groups");

        expect(list()).toBeNull();
    });

    it("stays open while its problems are gone through", () => {
        builder.show(TEMPLATE, WITH_PROBLEM);
        builder.click(chip());

        builder.click(builder.buttonLabelled("Show"));

        expect(list()).not.toBeNull();
        expect(heading()).toBe("Port");
    });

    it.each([
        [[], "No Issues"],
        [["error"], "1 Error"],
        [["warning", "warning"], "2 Warnings"],
        [["error", "error", "warning"], "2 Errors, 1 Warning"],
    ] as const)("sums up %j without what is not there", (severities, summary) => {
        builder.show(TEMPLATE, {
            diagnostics: severities.map((severity) => ({
                path: ["name"],
                severity,
                message: "m",
            })),
        });

        expect(chip()?.textContent).toBe(summary);
    });
});

describe("a template for a call activity on Camunda 7", () => {
    const CALL: Json = {
        $schema: C7_SCHEMA,
        name: "Call",
        id: "call",
        appliesTo: ["bpmn:CallActivity"],
        properties: [
            { label: "In", type: "String", binding: { type: "camunda:in", target: "x" } },
            { label: "Listener", type: "Hidden", binding: { type: "camunda:executionListener" } },
        ],
    };
    const bindingSelect = () =>
        builder.control("property-0-binding-type") as unknown as HTMLSelectElement;
    const optionsUnder = (group: string) =>
        Array.from(
            bindingSelect().querySelectorAll(`optgroup[label="${group}"] option`),
            (option) => option as HTMLOptionElement,
        );

    it("offers its in and out mappings among the bindings for it", () => {
        builder.show(CALL, { engine: "c7" });

        const direct = Array.from(
            bindingSelect().querySelectorAll(":scope > option"),
            (option) => (option as HTMLOptionElement).value,
        );

        expect(direct).toEqual(
            expect.arrayContaining(["camunda:in", "camunda:out", "camunda:in:businessKey"]),
        );
        expect(direct).not.toContain("camunda:field");
    });

    it("keeps field injection reachable under other element types", () => {
        builder.show(CALL, { engine: "c7" });

        expect(optionsUnder("For other element types").map(({ value }) => value)).toEqual([
            "camunda:field",
        ]);
    });

    it("lists what can only be edited in the JSON, without letting it be chosen", () => {
        builder.show(CALL, { engine: "c7" });

        const options = optionsUnder("Edit in the JSON for now");

        expect(options.map(({ value }) => value)).toEqual([
            "camunda:executionListener",
            "camunda:errorEventDefinition",
        ]);
        expect(options.every(({ disabled }) => disabled)).toBe(true);
    });

    it("keeps a binding that can only be edited in the JSON selectable while it is the current one", () => {
        builder.show(CALL, { engine: "c7" });
        builder.pick(1);

        const select = builder.control("property-1-binding-type") as unknown as HTMLSelectElement;

        expect(select.value).toBe("camunda:executionListener");
        expect(
            Array.from(
                select.querySelectorAll('optgroup[label="Edit in the JSON for now"] option'),
                (option) => (option as HTMLOptionElement).value,
            ),
        ).toEqual(["camunda:errorEventDefinition"]);
    });

    it("edits the fields of an in mapping", () => {
        builder.show(CALL, { engine: "c7" });

        expect(builder.control("property-0-binding-target")?.value).toBe("x");
        expect(builder.entry("property-0-binding-expression")).not.toBeNull();
        expect(builder.entry("property-0-binding-variables")).not.toBeNull();
    });
});

describe("element types", () => {
    it("names them in the chips and keeps the identifier as a hint", () => {
        builder.show(TEMPLATE);
        builder.tab("Template");

        const chip = builder.entry("template-appliesTo")!.querySelector(".etb-chip")!;

        expect(chip.textContent).toBe("Service task");
        expect(chip.getAttribute("title")).toBe("bpmn:ServiceTask");
    });

    it("names them in the pickers, with the identifier beside", () => {
        builder.show(TEMPLATE);
        builder.tab("Template");

        const labels = (id: string) =>
            Array.from(
                builder.control(id)!.querySelectorAll?.("option") ?? [],
                (option) => option.textContent,
            );

        expect(labels("template-elementType")).toContain("User task (bpmn:UserTask)");
        expect(labels("template-appliesTo")).toContain("User task (bpmn:UserTask)");
    });
});

describe("a property without a label", () => {
    it("is called after what it binds to, everywhere", () => {
        builder.show({
            ...TEMPLATE,
            properties: [
                {
                    type: "Hidden",
                    value: "mail",
                    binding: { type: "zeebe:taskDefinition", property: "type" },
                },
            ],
        });

        expect(indexTitles()).toEqual(["Task definition (type)"]);
        expect(heading()).toBe("Task definition (type)");
        expect(builder.entry("property-0-label")?.textContent).toContain(
            "Task definition (type): ",
        );
    });
});
