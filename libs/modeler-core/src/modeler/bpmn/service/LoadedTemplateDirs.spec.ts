import { describe, expect, it, vi } from "vitest";

import { LoadedTemplateDirs } from "./LoadedTemplateDirs";

const ROOT_TEMPLATES = "/work/.camunda/element-templates";
const NESTED_TEMPLATES = "/work/orders/.camunda/element-templates";

describe("LoadedTemplateDirs", () => {
    it("lists nested folders and each folder once across editors", () => {
        const loadedTemplateDirs = new LoadedTemplateDirs();

        loadedTemplateDirs.record("root-editor", [ROOT_TEMPLATES]);
        loadedTemplateDirs.record("nested-editor", [ROOT_TEMPLATES, NESTED_TEMPLATES]);

        expect(loadedTemplateDirs.list()).toEqual([ROOT_TEMPLATES, NESTED_TEMPLATES]);
    });

    it("tells listeners only when the list changes, and stops once disposed", () => {
        const loadedTemplateDirs = new LoadedTemplateDirs();
        const listener = vi.fn();
        const subscription = loadedTemplateDirs.onDidChange(listener);

        loadedTemplateDirs.record("root-editor", [ROOT_TEMPLATES]);
        loadedTemplateDirs.record("second-root-editor", [ROOT_TEMPLATES]);
        loadedTemplateDirs.release("second-root-editor");
        expect(listener).toHaveBeenCalledOnce();

        loadedTemplateDirs.release("root-editor");
        expect(listener).toHaveBeenCalledTimes(2);

        subscription.dispose();
        loadedTemplateDirs.record("root-editor", [ROOT_TEMPLATES]);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it("counts an editor without a template folder as an open editor until it is released", () => {
        const loadedTemplateDirs = new LoadedTemplateDirs();

        loadedTemplateDirs.record("editor-without-templates", []);
        expect(loadedTemplateDirs.hasEditors()).toBe(true);

        loadedTemplateDirs.release("editor-without-templates");
        expect(loadedTemplateDirs.hasEditors()).toBe(false);
    });
});
