import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    extend: vi.fn(),
    setLanguage: vi.fn(),
    extras: { overlay: true },
    instances: [] as Array<{ container: HTMLElement; options: unknown }>,
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({
    i18n: { extend: mocks.extend, setLanguage: mocks.setLanguage },
}));
vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: mocks.extras }));
vi.mock("./modeler", () => ({
    DmnModeler: class {
        setTheme = vi.fn();
        constructor(
            public readonly container: HTMLElement,
            public readonly options: unknown,
        ) {
            mocks.instances.push(this);
        }
    },
}));

import { createModeler } from "./createModeler";

describe("createModeler", () => {
    it("extends the translation overlay and resolves an independent handle", async () => {
        const container = document.createElement("main");
        const options = { propertiesPanel: { parent: document.createElement("aside") } };

        const handle = await createModeler(container, options);

        expect(mocks.extend).toHaveBeenCalledWith(mocks.extras);
        expect(handle).toBe(mocks.instances[0]);
        expect(mocks.instances[0]).toMatchObject({ container, options });
    });

    it("engages theming with the default automatic mode", async () => {
        const container = document.createElement("main");
        const options = { propertiesPanel: { parent: document.createElement("aside") } };

        const handle = await createModeler(container, options);

        expect(
            (handle as unknown as { setTheme: ReturnType<typeof vi.fn> }).setTheme,
        ).toHaveBeenCalledWith("automatic");
    });

    it("passes an explicit theme option through to setTheme", async () => {
        const container = document.createElement("main");
        const options = {
            propertiesPanel: { parent: document.createElement("aside") },
            theme: "dark" as const,
        };

        const handle = await createModeler(container, options);

        expect(
            (handle as unknown as { setTheme: ReturnType<typeof vi.fn> }).setTheme,
        ).toHaveBeenCalledWith("dark");
    });

    it("sets the page locale when the locale option is given", async () => {
        mocks.setLanguage.mockClear();
        const container = document.createElement("main");
        const options = {
            propertiesPanel: { parent: document.createElement("aside") },
            locale: "de",
        };

        await createModeler(container, options);

        expect(mocks.setLanguage).toHaveBeenCalledWith("de");
    });

    it("leaves the page locale alone when the locale option is omitted", async () => {
        mocks.setLanguage.mockClear();
        const container = document.createElement("main");
        const options = { propertiesPanel: { parent: document.createElement("aside") } };

        await createModeler(container, options);

        expect(mocks.setLanguage).not.toHaveBeenCalled();
    });
});
