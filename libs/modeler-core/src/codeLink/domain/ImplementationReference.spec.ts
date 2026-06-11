import { describe, expect, it } from "vitest";

import { beanToClassName, extractBeanName, fqcnToGlobPath } from "./ImplementationReference";

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
