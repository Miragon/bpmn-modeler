import { describe, expect, it } from "vitest";

import { groovyImportInsertionLine } from "./groovyImports";

const SPIN_S = "import static org.camunda.spin.Spin.S";
const SPIN_JSON_NODE = "import org.camunda.spin.json.SpinJsonNode";

describe("groovyImportInsertionLine", () => {
    describe("insertion placement", () => {
        it("targets line 0 for an empty script", () => {
            expect(groovyImportInsertionLine("", SPIN_S)).toBe(0);
        });

        it("targets line 0 for a script without imports", () => {
            expect(groovyImportInsertionLine("def x = S(json)", SPIN_S)).toBe(0);
        });

        it("targets the line below the last existing import", () => {
            const script = "import foo.Bar\nimport foo.Baz\n\ndef x = 1";
            expect(groovyImportInsertionLine(script, SPIN_S)).toBe(2);
        });

        it("targets below an import that is not on the first line", () => {
            const script = "// header comment\nimport foo.Bar\ndef x = 1";
            expect(groovyImportInsertionLine(script, SPIN_S)).toBe(2);
        });

        it("handles CRLF line endings", () => {
            expect(groovyImportInsertionLine("import foo.Bar\r\ndef x = 1", SPIN_S)).toBe(1);
        });
    });

    describe("already satisfied", () => {
        it("detects an exact match", () => {
            expect(groovyImportInsertionLine(`${SPIN_S}\ndef x = S(json)`, SPIN_S)).toBeUndefined();
        });

        it("tolerates a trailing semicolon", () => {
            expect(groovyImportInsertionLine(`${SPIN_S};`, SPIN_S)).toBeUndefined();
        });

        it("tolerates extra whitespace inside the statement", () => {
            const script = "  import  static   org.camunda.spin.Spin.S  ";
            expect(groovyImportInsertionLine(script, SPIN_S)).toBeUndefined();
        });

        it("accepts a covering static wildcard import", () => {
            const script = "import static org.camunda.spin.Spin.*";
            expect(groovyImportInsertionLine(script, SPIN_S)).toBeUndefined();
        });

        it("accepts a covering package wildcard import for a type", () => {
            const script = "import org.camunda.spin.json.*";
            expect(groovyImportInsertionLine(script, SPIN_JSON_NODE)).toBeUndefined();
        });
    });

    describe("not satisfied by lookalikes", () => {
        it("is not satisfied by an unrelated import", () => {
            expect(groovyImportInsertionLine("import foo.Bar", SPIN_S)).toBe(1);
        });

        it("is not satisfied by the sibling symbol from the same class", () => {
            const script = "import static org.camunda.spin.Spin.JSON";
            expect(groovyImportInsertionLine(script, SPIN_S)).toBe(1);
        });

        it("is not satisfied by a commented-out import", () => {
            expect(groovyImportInsertionLine(`// ${SPIN_S}`, SPIN_S)).toBe(0);
        });
    });
});
