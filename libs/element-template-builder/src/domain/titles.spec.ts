import { describe, expect, it } from "vitest";

import { catalogFor } from "../catalog";
import { groupTitle, problemPlace, propertyTitle } from "./titles";

const C8 = catalogFor("c8");
const translate = (text: string) => text;

describe("propertyTitle", () => {
    it.each([
        ["its label", { label: "Host", id: "host", type: "String" }, "Host"],
        ["its id", { id: "host", type: "Hidden" }, "host"],
        [
            "what it binds to, in words",
            { type: "Hidden", binding: { type: "zeebe:taskDefinition", property: "type" } },
            "Task definition (type)",
        ],
        [
            "the input it maps",
            { type: "String", binding: { type: "zeebe:input", name: "host" } },
            "Input mapping (host)",
        ],
        [
            "a binding without a target",
            { binding: { type: "zeebe:userTask" } },
            "Camunda user task",
        ],
        ["a binding it does not know", { binding: { type: "zeebe:new" } }, "zeebe:new"],
        ["nothing else", { type: "String" }, "Unlabeled property"],
    ])("names a property by %s", (_, property, title) => {
        expect(propertyTitle(property, C8, translate)).toBe(title);
    });

    it("translates the binding's name", () => {
        const title = propertyTitle(
            { binding: { type: "zeebe:input", name: "a" } },
            C8,
            (text) => `de:${text}`,
        );

        expect(title).toBe("de:Input mapping (a)");
    });
});

describe("groupTitle", () => {
    it.each([
        [{ label: "Auth", id: "auth" }, "Auth"],
        [{ id: "auth" }, "auth"],
        [{}, "Unnamed group"],
    ])("names %j", (group, title) => {
        expect(groupTitle(group, translate)).toBe(title);
    });
});

describe("problemPlace", () => {
    const template = { properties: [{ label: "Host" }], groups: [{ label: "Auth" }] };

    it.each([
        [["properties", 0, "value"], "Host"],
        [["groups", 0, "id"], "Auth"],
        [["name"], undefined],
        [["elementType", "value"], undefined],
        [["other", 0], undefined],
    ])("names the place of %j", (path, place) => {
        expect(problemPlace(path, template, C8, translate)).toBe(place);
    });
});
