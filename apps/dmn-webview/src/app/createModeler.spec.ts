import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    extend: vi.fn(),
    extras: { overlay: true },
    instances: [] as Array<{ container: HTMLElement; options: unknown }>,
}));

vi.mock("@miragon/bpmn-modeler-i18n", () => ({ i18n: { extend: mocks.extend } }));
vi.mock("@miragon/bpmn-modeler-i18n-extras", () => ({ extras: mocks.extras }));
vi.mock("./modeler", () => ({
    DmnModeler: class {
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
});
