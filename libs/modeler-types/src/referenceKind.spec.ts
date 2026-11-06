import { describe, expect, it } from "vitest";

import {
    REFERENCED_MODEL_FILE_EXTENSION,
    isReferenceKind,
    referenceKindSupports,
    type ReferenceKind,
    type ReferenceKindCapability,
} from "./referenceKind";

describe("isReferenceKind", () => {
    it.each(["process", "decision", "form"])("accepts %s", (value) => {
        expect(isReferenceKind(value)).toBe(true);
    });

    it.each([
        ["an unknown kind", "script"],
        ["a differently cased kind", "Process"],
        ["the empty string", ""],
        ["an inherited Object key", "toString"],
        ["the prototype key", "__proto__"],
        ["undefined", undefined],
        ["a number", 1],
        ["an array that stringifies to a kind", ["form"]],
    ])("rejects %s", (_label, value) => {
        expect(isReferenceKind(value)).toBe(false);
    });
});

describe("referenceKindSupports", () => {
    it.each<{ kind: ReferenceKind; capability: ReferenceKindCapability; supported: boolean }>([
        { kind: "process", capability: "availabilityStatus", supported: false },
        { kind: "decision", capability: "availabilityStatus", supported: false },
        { kind: "form", capability: "availabilityStatus", supported: true },
        { kind: "process", capability: "preview", supported: false },
        { kind: "decision", capability: "preview", supported: false },
        { kind: "form", capability: "preview", supported: true },
    ])("answers $supported for $kind and $capability", ({ kind, capability, supported }) => {
        expect(referenceKindSupports(kind, capability)).toBe(supported);
    });
});

describe("REFERENCED_MODEL_FILE_EXTENSION", () => {
    it.each<[ReferenceKind, string]>([
        ["process", ".bpmn"],
        ["decision", ".dmn"],
        ["form", ".form"],
    ])("finds a %s in a %s file", (kind, extension) => {
        expect(REFERENCED_MODEL_FILE_EXTENSION[kind]).toBe(extension);
    });
});
