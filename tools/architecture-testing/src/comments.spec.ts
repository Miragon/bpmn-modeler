import { describe, expect, it } from "vitest";

import { stripComments } from "./comments";

describe("stripComments", () => {
    it.each([
        {
            form: "a // inside a string",
            source: 'const url = "http://x"; // note',
            stripped: 'const url = "http://x";  ',
        },
        {
            form: "a // inside a template",
            source: "const url = `http://${host}/path`; /* note */",
            stripped: "const url = `http://${host}/path`;  ",
        },
        {
            form: "a // inside a regular expression",
            source: "const protocol = /^https?:\\/\\//; // note",
            stripped: "const protocol = /^https?:\\/\\//;  ",
        },
        {
            form: "a JSDoc block",
            source: '/** {@link import("./a")} */\nexport const a = 1;',
            stripped: " \nexport const a = 1;",
        },
        {
            form: "a comment between tokens",
            source: "a/**/.b",
            stripped: "a .b",
        },
        {
            form: "several comments in one file",
            source: "/* a */ const a = 1; // b\n// c\nconst c = 2; /* d */",
            stripped: "  const a = 1;  \n \nconst c = 2;  ",
        },
        {
            form: "a comment at the end of the file",
            source: "export {};\n// console.warn(x)",
            stripped: "export {};\n ",
        },
        {
            form: "a comment after a comma on the same line",
            source: "const o = { a: 1, // one\n b: 2 };",
            stripped: "const o = { a: 1,  \n b: 2 };",
        },
        {
            form: "a comment in an empty argument list",
            source: "f(/* none */);",
            stripped: "f( );",
        },
        {
            form: "a comment in an empty block",
            source: "if (a) { /* none */ }",
            stripped: "if (a) {   }",
        },
        {
            form: "a comment inside a template substitution",
            source: "const t = `${a /* note */}//`;",
            stripped: "const t = `${a  }//`;",
        },
        {
            form: "a comment after a shebang",
            source: "#!/usr/bin/env node\n// note\nrun();",
            stripped: "#!/usr/bin/env node\n \nrun();",
        },
    ])("keeps the code around $form", ({ source, stripped }) => {
        expect(stripComments("module.ts", source)).toBe(stripped);
    });

    it.each([
        { form: "JSX text", source: "const view = <a>see // here</a>;" },
        { form: "JSX text that opens with a space", source: "const view = <a> // here</a>;" },
        { form: "JSX text on its own line", source: "const view = <a>\n  // here\n</a>;" },
    ])("reads $form in a .tsx file as text, not as a comment", ({ source }) => {
        expect(stripComments("view.tsx", source)).toBe(source);
    });

    it.each([
        {
            form: "a comment inside a JSX tag",
            source: "const view = <a /* note */ b={1} // note\n />;",
            stripped: "const view = <a   b={1}  \n />;",
        },
        {
            form: "a comment in a JSX expression",
            source: "const view = <a>{/* note */}</a>;",
            stripped: "const view = <a>{ }</a>;",
        },
        {
            form: "a comment before a JSX fragment",
            source: "const view = /* note */ <></>;",
            stripped: "const view =   <></>;",
        },
    ])("strips $form in a .tsx file", ({ source, stripped }) => {
        expect(stripComments("view.tsx", source)).toBe(stripped);
    });
});
