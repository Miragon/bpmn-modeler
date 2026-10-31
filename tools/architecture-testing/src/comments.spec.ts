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
    ])("keeps the code around $form", ({ source, stripped }) => {
        expect(stripComments("module.ts", source)).toBe(stripped);
    });

    it("reads JSX text in a .tsx file as text, not as a comment", () => {
        const source = "const view = <a>see // here</a>;";

        expect(stripComments("view.tsx", source)).toBe(source);
    });
});
