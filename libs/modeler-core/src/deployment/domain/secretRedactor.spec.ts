import { describe, expect, it } from "vitest";

import { SecretRedactor } from "./secretRedactor";

describe("SecretRedactor", () => {
    describe("of", () => {
        it("masks every occurrence of a secret", () => {
            expect(SecretRedactor.of("s3cret").redact("s3cret rejected, s3cret again")).toBe(
                "*** rejected, *** again",
            );
        });

        it.each([
            ["percent-encoded", "p%40ss%20word%26more"],
            ["form-encoded", "p%40ss+word%26more"],
            ["double percent-encoded", "p%2540ss%2520word%2526more"],
        ])("masks the %s echo of a secret", (_form, echoed) => {
            expect(SecretRedactor.of("p@ss word&more").redact(`got ${echoed}.`)).toBe("got ***.");
        });

        it.each([
            ["lowercase", "tok%2fab%3a%5b1%5d"],
            ["mixed-case", "tok%2Fab%3a%5B1%5d"],
        ])("masks a percent-encoded echo re-encoded with %s hex", (_case, echoed) => {
            expect(SecretRedactor.of("tok/ab:[1]").redact(`got ${echoed}.`)).toBe("got ***.");
        });

        it.each(['p@ss"w0rd!', "ab cd$ef"])(
            "masks %s as a server quotes it from the path of the request URL",
            (secret) => {
                const requestUrl = new URL(`https://gw.example/hooks/${secret}/deploy`).href;

                expect(requestUrl).not.toContain(secret);
                expect(SecretRedactor.of(secret).redact(`Not found: ${requestUrl}`)).toBe(
                    "Not found: https://gw.example/hooks/***/deploy",
                );
            },
        );

        it("masks a secret holding regex metacharacters only literally", () => {
            const redactor = SecretRedactor.of("a.b*c(d)");

            expect(redactor.redact("got a.b*c(d)")).toBe("got ***");
            expect(redactor.redact("got aXbbbcd and aXbbbc(d)")).toBe("got aXbbbcd and aXbbbc(d)");
        });

        it("masks a secret JSON-escaped inside an echoed body", () => {
            const secret = 'pa"ss\\word';

            expect(SecretRedactor.of(secret).redact(JSON.stringify({ password: secret }))).toBe(
                '{"password":"***"}',
            );
        });

        it("masks a secret exactly as URLSearchParams form-encodes it in a token request", () => {
            const secret = "abc8Q~d!e(f)g'h";
            const body = new URLSearchParams({ client_secret: secret }).toString();

            expect(SecretRedactor.of(secret).redact(body)).toBe("client_secret=***");
        });

        it.each([
            ["shorter one first", ["abc", "abcdef"]],
            ["longer one first", ["abcdef", "abc"]],
        ])("masks a secret containing another whole, given the %s", (_order, secrets) => {
            expect(SecretRedactor.of(...secrets).redact("token abcdef")).toBe("token ***");
        });

        it("ignores undefined, empty and whitespace-only values", () => {
            const message = "HTTP 500:  \t internal error";

            expect(SecretRedactor.of(undefined, "", "   ", "\t").redact(message)).toBe(message);
        });
    });

    describe("none", () => {
        it("masks nothing", () => {
            expect(SecretRedactor.none().redact("s3cret")).toBe("s3cret");
        });
    });

    describe("and", () => {
        it("masks the secrets of both redactors", () => {
            const redactor = SecretRedactor.of("alpha").and(SecretRedactor.of("beta"));

            expect(redactor.redact("alpha and beta")).toBe("*** and ***");
        });
    });

    describe("forUrl", () => {
        it("masks userinfo and query values but keeps scheme, host and path readable", () => {
            const url =
                "https://admin:s3cret@camunda.example:8443/engine-rest?token=abc&tenant=acme";

            expect(SecretRedactor.forUrl(url).redact(`POST ${url} failed`)).toBe(
                "POST https://***:***@camunda.example:8443/engine-rest?*** failed",
            );
        });

        it("masks percent-encoded userinfo in its raw and decoded form", () => {
            const redactor = SecretRedactor.forUrl("https://us%20er:p%40ss@camunda.example/");

            expect(redactor.redact("us%20er p%40ss")).toBe("*** ***");
            expect(redactor.redact("us er p@ss")).toBe("*** ***");
        });

        it("masks each query value in its raw and decoded form", () => {
            const redactor = SecretRedactor.forUrl("https://gw.example/deploy?key=a%2Bb&sig=x+y");

            expect(redactor.redact("raw a%2Bb x+y")).toBe("raw *** ***");
            expect(redactor.redact("decoded a+b x y")).toBe("decoded *** ***");
        });

        it("masks the whole raw query, so a value-less parameter is masked too", () => {
            const redactor = SecretRedactor.forUrl("https://gw.example/deploy?ghp_token1");

            expect(redactor.redact("unknown parameter ghp_token1")).toBe("unknown parameter ***");
        });

        it("masks nothing for a URL without userinfo or query", () => {
            const url = "https://camunda.example/engine-rest";

            expect(SecretRedactor.forUrl(url).redact(`POST ${url}`)).toBe(`POST ${url}`);
        });

        it("masks nothing for an unparseable URL", () => {
            const url = "camunda.example/engine-rest?token=abc";

            expect(SecretRedactor.forUrl(url).redact(`POST ${url}`)).toBe(`POST ${url}`);
        });
    });

    describe("forAuthHeaders", () => {
        it("masks each header value whole and without its scheme", () => {
            const redactor = SecretRedactor.forAuthHeaders({
                Authorization: "Basic YWRtaW46czNjcmV0",
            });

            expect(redactor.redact("got Basic YWRtaW46czNjcmV0")).toBe("got ***");
            expect(redactor.redact("credential YWRtaW46czNjcmV0")).toBe("credential ***");
            expect(redactor.redact("unsupported scheme Basic")).toBe("unsupported scheme Basic");
        });

        it("masks a header value that carries no scheme", () => {
            expect(SecretRedactor.forAuthHeaders({ "X-Api-Key": "k3y" }).redact("k3y")).toBe("***");
        });
    });
});
