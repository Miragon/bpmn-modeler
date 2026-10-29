import { describe, expect, it } from "vitest";

import {
    DirectoryNotFound,
    ExecutionPlatformNotDetectedError,
    FileNotFound,
    NoWorkspaceFolderFoundError,
    UserCancelledError,
} from "./errors";

describe("kernel errors", () => {
    it.each<[string, () => Error, string]>([
        [
            "a missing workspace folder",
            () => new NoWorkspaceFolderFoundError(),
            "No workspace folder found.",
        ],
        ["a missing file", () => new FileNotFound("/ws/a.bpmn"), "File not found: /ws/a.bpmn"],
        [
            "a missing directory",
            () => new DirectoryNotFound("/ws/forms"),
            "Directory not found: /ws/forms",
        ],
        [
            "an undetected execution platform",
            () => new ExecutionPlatformNotDetectedError(),
            "The execution platform could not be detected.",
        ],
        [
            "a dismissed prompt",
            () => new UserCancelledError(),
            "The operation was cancelled by the user.",
        ],
    ])("explains %s", (_case, createError, message) => {
        expect(createError().message).toBe(message);
    });
});
