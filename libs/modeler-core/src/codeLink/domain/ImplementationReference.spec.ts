import { describe, expect, it } from "vitest";

import {
    beanToClassName,
    extractBeanName,
    fqcnToGlobPath,
    JVM_SOURCE_FILES,
    SOURCE_FILES,
    SourceFileSet,
} from "./ImplementationReference";

describe("SourceFileSet", () => {
    it.each<{ name: string; files: SourceFileSet; stem?: string; glob: string }>([
        { name: "JVM", files: JVM_SOURCE_FILES, glob: "**/*.{java,kt,groovy,scala}" },
        {
            name: "JVM com/x/A",
            files: JVM_SOURCE_FILES,
            stem: "com/x/A",
            glob: "**/com/x/A.{java,kt,groovy,scala}",
        },
        { name: "all", files: SOURCE_FILES, glob: "**/*.{java,kt,groovy,scala,js,ts}" },
    ])("globs the $name sources as $glob", ({ files, stem, glob }) => {
        expect(files.glob(stem)).toBe(glob);
    });

    it.each<{ name: string; files: SourceFileSet; path: string; included: boolean }>([
        { name: "JVM", files: JVM_SOURCE_FILES, path: "/src/A.java", included: true },
        { name: "JVM", files: JVM_SOURCE_FILES, path: "/src/A.scala", included: true },
        { name: "JVM", files: JVM_SOURCE_FILES, path: "/src/worker.ts", included: false },
        { name: "all", files: SOURCE_FILES, path: "/src/worker.ts", included: true },
        { name: "all", files: SOURCE_FILES, path: "/src/A.kt", included: true },
        { name: "all", files: SOURCE_FILES, path: "/order.bpmn", included: false },
        { name: "all", files: SOURCE_FILES, path: "/src/java", included: false },
    ])("counts $path among the $name sources: $included", ({ files, path, included }) => {
        expect(files.includes(path)).toBe(included);
    });
});

describe("extractBeanName", () => {
    it("reads a plain ${bean} expression", () => {
        expect(extractBeanName("${myBean}")).toBe("myBean");
    });

    it("reads the leading id before a method call", () => {
        expect(extractBeanName("${svc.run()}")).toBe("svc");
    });

    it("supports the #{…} EL prefix", () => {
        expect(extractBeanName("#{myBean}")).toBe("myBean");
    });

    it("tolerates whitespace inside the braces", () => {
        expect(extractBeanName("${ myBean }")).toBe("myBean");
    });

    it("reads a bare identifier with no wrapper", () => {
        expect(extractBeanName("myBean")).toBe("myBean");
    });

    it("returns undefined when no identifier leads", () => {
        expect(extractBeanName("${ 1 + 2 }")).toBeUndefined();
        expect(extractBeanName("${.foo}")).toBeUndefined();
    });
});

describe("beanToClassName", () => {
    it("capitalises the first letter", () => {
        expect(beanToClassName("myBean")).toBe("MyBean");
    });

    it("leaves an already-capitalised name unchanged", () => {
        expect(beanToClassName("MyBean")).toBe("MyBean");
    });

    it("handles an empty string", () => {
        expect(beanToClassName("")).toBe("");
    });
});

describe("fqcnToGlobPath", () => {
    it("converts dots to slashes", () => {
        expect(fqcnToGlobPath("com.example.MyDelegate")).toBe("com/example/MyDelegate");
    });

    it("leaves a single-segment name unchanged", () => {
        expect(fqcnToGlobPath("MyDelegate")).toBe("MyDelegate");
    });
});
