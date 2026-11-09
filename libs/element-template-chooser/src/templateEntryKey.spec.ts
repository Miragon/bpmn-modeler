import { describe, expect, it } from "vitest";

import { templateIdOfEntryKey } from "./templateEntryKey";

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
