import { describe, expect, it } from "vitest";

import { readStringLiterals } from "./stringLiterals";

describe("readStringLiterals", () => {
    it("reads string and plain template literals in source order, not comments or interpolations", () => {
        const source = [
            '// "src/commented.ts"',
            'import { resolve } from "node:path";',
            "export default {",
            '    input: resolve(__dirname, "src/main.ts"),',
            "    worker: `src/worker.ts`,",
            "    out: `${dir}/dist`,",
            "};",
        ].join("\n");

        expect(readStringLiterals("vite.config.ts", source)).toEqual([
            "node:path",
            "src/main.ts",
            "src/worker.ts",
        ]);
    });
});
