import { describe, expect, it } from "vitest";

import { receiveErrorPrefix } from "./receiveErrorPrefix";

describe("receiveErrorPrefix", () => {
    it("names the message type the failure belongs to", () => {
        expect(receiveErrorPrefix("LanguageQuery")).toBe(
            "Error receiving message: LanguageQuery — ",
        );
    });
});
