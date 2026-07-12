import { ScriptKind } from "@miragon/bpmn-modeler-shared";
import { describe, expect, it } from "vitest";

import {
    BeanDef,
    COMPLEX_TYPES,
    globalFunctionsFor,
    methodsForBean,
    methodsForType,
} from "./scriptApi";

const ALL_KINDS: readonly ScriptKind[] = ["script-task", "execution-listener", "task-listener"];

describe("globalFunctionsFor", () => {
    it("offers the SPIN globals S and JSON for every script kind", () => {
        for (const kind of ALL_KINDS) {
            const names = globalFunctionsFor(kind).map((fn) => fn.name);
            expect(names).toContain("S");
            expect(names).toContain("JSON");
        }
    });

    it("types each SPIN global's return as SpinJsonNode", () => {
        const globals = globalFunctionsFor("script-task");
        expect(globals.every((fn) => fn.returnType === "SpinJsonNode")).toBe(true);
    });

    it("carries the groovy static import for each SPIN global", () => {
        const byName = new Map(globalFunctionsFor("script-task").map((fn) => [fn.name, fn]));
        expect(byName.get("S")?.groovyImport).toBe("import static org.camunda.spin.Spin.S");
        expect(byName.get("JSON")?.groovyImport).toBe("import static org.camunda.spin.Spin.JSON");
    });
});

describe("SpinJsonNode catalog entry", () => {
    it("is registered in COMPLEX_TYPES so 2c can resolve a typeHint", () => {
        expect(COMPLEX_TYPES.some((type) => type.name === "SpinJsonNode")).toBe(true);
    });

    it("is the only complex type carrying a groovy import (context beans need none)", () => {
        const importable = COMPLEX_TYPES.filter((type) => type.groovyImport);
        expect(importable.map((type) => type.name)).toEqual(["SpinJsonNode"]);
        expect(importable[0].groovyImport).toBe("import org.camunda.spin.json.SpinJsonNode");
    });

    it("resolves its methods through methodsForBean for a SpinJsonNode-typed bean", () => {
        // No bean ships with this type in 2a; a synthetic one proves the
        // type-name lookup (the path 2c reuses for typed variables) works.
        const bean: BeanDef = {
            name: "node",
            type: "SpinJsonNode",
            description: "synthetic",
        };
        const methodNames = methodsForBean(bean).map((m) => m.name);
        expect(methodNames).toContain("prop");
        expect(methodNames).toContain("elements");
        expect(methodNames).toContain("mapTo");
    });
});

describe("methodsForType", () => {
    it("resolves the SpinJsonNode methods by type name", () => {
        const methodNames = methodsForType("SpinJsonNode").map((m) => m.name);
        expect(methodNames).toContain("prop");
        expect(methodNames).toContain("stringValue");
        expect(methodNames).toContain("mapTo");
    });

    it("returns no methods for a primitive or unknown type name", () => {
        expect(methodsForType("long")).toEqual([]);
        expect(methodsForType("Nonexistent")).toEqual([]);
    });
});
