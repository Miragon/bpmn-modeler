import { describe, expect, it } from "vitest";

import { BasicAuth, NoAuth } from "./deployment";

describe("NoAuth", () => {
    describe("toHeaders", () => {
        it("should return an empty header set", () => {
            expect(new NoAuth().toHeaders()).toEqual({});
        });
    });
});

describe("BasicAuth", () => {
    describe("toHeaders", () => {
        it("should return a Base64-encoded Authorization header", () => {
            const expected = Buffer.from("admin:secret").toString("base64");

            expect(new BasicAuth("admin", "secret").toHeaders()).toEqual({
                Authorization: `Basic ${expected}`,
            });
        });

        // Guards the RFC 7617 UTF-8 contract — Latin-1 (e.g. btoa) would
        // produce a different base64 string and break interoperability.
        it("should UTF-8-encode non-ASCII credentials before base64", () => {
            const expected = Buffer.from("user:name:p@ss:wörd").toString("base64");

            expect(new BasicAuth("user:name", "p@ss:wörd").toHeaders()).toEqual({
                Authorization: `Basic ${expected}`,
            });
        });
    });
});
