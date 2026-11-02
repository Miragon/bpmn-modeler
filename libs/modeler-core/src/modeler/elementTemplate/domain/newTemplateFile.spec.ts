import { describe, expect, it } from "vitest";

import {
    templateFileCreated,
    templateFileName,
    templateFilePrompt,
    templateFileTaken,
} from "./newTemplateFile";

describe("templateFileName", () => {
    it.each([
        ["payment", "payment.json"],
        ["payment.json", "payment.json"],
        ["  payment  ", "payment.json"],
        ["Payment.JSON", "Payment.json"],
        ["send mail", "send-mail.json"],
        ["Send  Invoice Mail", "send-invoice-mail.json"],
        ["sendMail", "sendMail.json"],
        ["io.camunda.SendMail", "io.camunda.SendMail.json"],
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

describe("what the prompt says", () => {
    it("asks for a file name and names the folder", () => {
        expect(templateFilePrompt(".camunda/element-templates")).toBe(
            "The file name of the new template. It goes into .camunda/element-templates.",
        );
    });

    it("names the folder a taken name is in, if there is one", () => {
        expect(templateFileTaken("a.json", ".camunda/element-templates")).toBe(
            "a.json already exists in .camunda/element-templates.",
        );
        expect(templateFileTaken("a.json")).toBe("a.json already exists.");
    });

    it("names the file a typed name creates", () => {
        expect(templateFileCreated("send-mail.json")).toBe("Creates send-mail.json.");
    });
});
