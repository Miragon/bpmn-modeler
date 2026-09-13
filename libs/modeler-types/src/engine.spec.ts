import { describe, expect, it } from "vitest";

import { detectEngine } from "./engine";

const MODELER_NS = "http://camunda.org/schema/modeler/1.0";

function definitions(attributes: string): string {
    return `<bpmn:definitions xmlns:modeler="${MODELER_NS}" ${attributes} />`;
}

describe("detectEngine", () => {
    it("detects c7 from the Camunda Platform execution-platform name", () => {
        expect(detectEngine(definitions('modeler:executionPlatform="Camunda Platform"'))).toBe(
            "c7",
        );
    });

    it("detects c8 from the Camunda Cloud execution-platform name", () => {
        expect(detectEngine(definitions('modeler:executionPlatform="Camunda Cloud"'))).toBe("c8");
    });

    it("falls back to the version major digit when no platform name is present", () => {
        expect(detectEngine(definitions('modeler:executionPlatformVersion="7.23.0"'))).toBe("c7");
        expect(detectEngine(definitions('modeler:executionPlatformVersion="8.6.0"'))).toBe("c8");
    });

    it("prefers the platform name over a contradicting version", () => {
        expect(
            detectEngine(
                definitions(
                    'modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="8.6.0"',
                ),
            ),
        ).toBe("c7");
    });

    it("returns undefined for an unrecognised platform name and no usable version", () => {
        expect(
            detectEngine(definitions('modeler:executionPlatform="Some Other Platform"')),
        ).toBeUndefined();
    });

    it("returns undefined when there is no platform metadata", () => {
        expect(detectEngine("<bpmn:definitions />")).toBeUndefined();
    });

    it("returns undefined for an empty string", () => {
        expect(detectEngine("")).toBeUndefined();
    });

    it("detects single-quoted attribute values", () => {
        expect(detectEngine(definitions("modeler:executionPlatform='Camunda Cloud'"))).toBe("c8");
    });

    it("tolerates whitespace around the equals sign", () => {
        expect(detectEngine(definitions('modeler:executionPlatform = "Camunda Cloud"'))).toBe("c8");
    });

    it("resolves the modeler prefix from the namespace binding", () => {
        const xml = `<bpmn:definitions xmlns:m="${MODELER_NS}" m:executionPlatform="Camunda Cloud" />`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("ignores a misleading comment before a genuine C8 root", () => {
        const xml = `<!-- modeler:executionPlatform="Camunda Platform" -->\n${definitions(
            'modeler:executionPlatform="Camunda Cloud"',
        )}`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("ignores misleading CDATA before a genuine C8 root", () => {
        const xml = `<?xml version="1.0"?><![CDATA[modeler:executionPlatform="Camunda Platform"]]>${definitions(
            'modeler:executionPlatform="Camunda Cloud"',
        )}`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("detects regardless of attribute order", () => {
        const xml = `<bpmn:definitions m:executionPlatform="Camunda Cloud" xmlns:m="${MODELER_NS}" />`;
        expect(detectEngine(xml)).toBe("c8");
    });

    it("skips the XML declaration and DOCTYPE before the root", () => {
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE definitions [<!ENTITY x "y">]>\n${definitions(
            'modeler:executionPlatform="Camunda Platform"',
        )}`;
        expect(detectEngine(xml)).toBe("c7");
    });

    it("returns undefined when the root element is not definitions", () => {
        expect(
            detectEngine(`<bpmn:process modeler:executionPlatform="Camunda Cloud" />`),
        ).toBeUndefined();
    });

    it("returns undefined for a bare attribute fragment without a root element", () => {
        expect(detectEngine('modeler:executionPlatform="Camunda Cloud"')).toBeUndefined();
    });

    it("still detects with the literal modeler prefix when no xmlns binding exists", () => {
        expect(detectEngine('<bpmn:definitions modeler:executionPlatform="Camunda Cloud" />')).toBe(
            "c8",
        );
    });

    it("does not throw and returns undefined on malformed markup", () => {
        expect(detectEngine("<bpmn:definitions")).toBeUndefined();
        expect(
            detectEngine('<bpmn:definitions modeler:executionPlatform="Camunda Cloud'),
        ).toBeUndefined();
        expect(detectEngine("<!-- unclosed comment")).toBeUndefined();
        expect(detectEngine("not xml at all")).toBeUndefined();
    });
});
