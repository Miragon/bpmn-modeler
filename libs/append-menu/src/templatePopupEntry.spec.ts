import { describe, expect, it } from "vitest";

import { isTemplatePopupEntry, templateIdOfEntryKey } from "./templatePopupEntry";
import type { PopupMenuEntry } from "./types";

type EntryCase = [string, string, Partial<PopupMenuEntry> | undefined];

describe("templateIdOfEntryKey", () => {
    it.each([
        ["append.template-com.example.rest", "com.example.rest"],
        ["create.template-rest", "rest"],
        ["replace.template-rest", "rest"],
        ["template-rest", "rest"],
        ["append.template-my-template-rest", "my-template-rest"],
        ["append.template-a.template-b", "a.template-b"],
        ["append.template-a b#1@2", "a b#1@2"],
    ])("reads %s as template %s", (key, templateId) => {
        expect(templateIdOfEntryKey(key)).toBe(templateId);
    });

    it.each([
        "append.task",
        "replace-with-service-task",
        "my-template-rest",
        "append.mytemplate-rest",
        "append.template-",
        "",
    ])("reads %j as no template entry", (key) => {
        expect(templateIdOfEntryKey(key)).toBeUndefined();
    });
});

describe("isTemplatePopupEntry", () => {
    const templatesGroup = { id: "templates", name: "Templates" };
    const icon = "data:image/svg+xml;base64,PHN2Zy8+";

    it.each<EntryCase>([
        ["an upstream append entry", "append.template-rest", { group: templatesGroup }],
        ["an upstream create entry", "create.template-rest", { group: templatesGroup }],
        ["an upstream replace entry", "replace.template-rest", { group: templatesGroup }],
        [
            "a template key in another group",
            "append.template-rest",
            { group: { id: "tasks", name: "Tasks" } },
        ],
        ["a template key without an entry", "append.template-rest", undefined],
        ["a plugin entry in the templates group", "my-plugin.rest", { group: templatesGroup }],
    ])("counts %s as a template entry", (_case, key, entry) => {
        expect(isTemplatePopupEntry(key, entry)).toBe(true);
    });

    it.each<EntryCase>([
        ["a BPMN element entry", "append.task", { group: { id: "tasks", name: "Tasks" } }],
        ["a plugin entry with its own icon", "my-plugin.custom-task", { imageUrl: icon }],
        [
            "a plugin entry with an icon in its own group",
            "my-plugin.custom-task",
            { imageUrl: icon, group: { id: "custom", name: "Custom" } },
        ],
        ["an entry without a group", "append.task", {}],
        ["a key without an entry", "append.task", undefined],
    ])("does not count %s as a template entry", (_case, key, entry) => {
        expect(isTemplatePopupEntry(key, entry)).toBe(false);
    });
});
