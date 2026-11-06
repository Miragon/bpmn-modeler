import { describe, expect, it } from "vitest";

import { readKotlinImports } from "./kotlinImports";

describe("readKotlinImports", () => {
    it("reads each import's name, a wildcard and an aliased import included", () => {
        const source = [
            '@file:Suppress("UNUSED")',
            "package io.miragon.x",
            "",
            "import com.intellij.openapi.ui.DialogWrapper",
            "import com.intellij.ui.dsl.builder.*",
            "import javax.swing.JComponent as Component",
            "import java.io.File",
            "",
            "class A",
        ].join("\n");

        expect(readKotlinImports(source)).toEqual([
            "com.intellij.openapi.ui.DialogWrapper",
            "com.intellij.ui.dsl.builder.*",
            "javax.swing.JComponent",
            "java.io.File",
        ]);
    });

    it.each([
        { form: "a line comment", source: "// import com.intellij.A" },
        { form: "a block comment", source: "/*\nimport com.intellij.A\n*/" },
        { form: "a raw string", source: 'val a = """\nimport com.intellij.A\n"""' },
        { form: "a name inside a body", source: "fun a() {\n    import(com.intellij.A)\n}" },
        { form: "a name after a token on its line", source: "val import = com.intellij.A" },
    ])("does not read $form as an import", ({ source }) => {
        expect(readKotlinImports(source)).toEqual([]);
    });
});
