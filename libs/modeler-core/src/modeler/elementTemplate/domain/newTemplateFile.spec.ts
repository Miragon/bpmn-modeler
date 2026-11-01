import { describe, expect, it } from "vitest";

import { templateFileName } from "./newTemplateFile";

describe("templateFileName", () => {
    it.each([
        ["payment", "payment.json"],
        ["payment.json", "payment.json"],
        ["  payment  ", "payment.json"],
        ["Payment.JSON", "Payment.json"],
        ["send mail", "send mail.json"],
        ["v1.2", "v1.2.json"],
        ["mapping.jsonata", "mapping.jsonata.json"],
    ])("names the file for %j %j", (input, fileName) => {
        expect(templateFileName(input)).toEqual({ kind: "valid", fileName });
    });

    it.each(["", "   ", ".json", ".", "..", "...json"])("asks for a name for %j", (input) => {
        expect(templateFileName(input)).toEqual({
            kind: "invalid",
            message: "Enter a file name.",
        });
    });

    it.each(["templates/payment", "templates\\payment", "a:b", "a*b", "a?b", 'a"b', "a<b", "a|b"])(
        "rejects %j, which is not a portable file name",
        (input) => {
            expect(templateFileName(input)).toEqual({
                kind: "invalid",
                message: 'A file name cannot contain any of these characters: / \\ : * ? " < > |',
            });
        },
    );
});
