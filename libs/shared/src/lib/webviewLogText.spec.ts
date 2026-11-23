import { describe, expect, it } from "vitest";

import { LogDebugCommand, LogErrorCommand, LogInfoCommand, LogWarningCommand } from "./messages";
import { webviewLogText } from "./webviewLogText";

describe("webviewLogText", () => {
    it("puts a caught error's stack under its message", () => {
        expect(
            webviewLogText(new LogErrorCommand("Could not render", "Error: boom\n    at render")),
        ).toBe("Could not render\nError: boom\n    at render");
    });

    it("is the message alone for an error without a stack", () => {
        expect(webviewLogText(new LogErrorCommand("Could not render"))).toBe("Could not render");
    });

    it.each([
        new LogDebugCommand("debug text", "Error: boom"),
        new LogInfoCommand("info text", "Error: boom"),
        new LogWarningCommand("warning text", "Error: boom"),
    ])("leaves the stack off a $type", (command) => {
        expect(webviewLogText(command)).toBe(command.message);
    });
});
