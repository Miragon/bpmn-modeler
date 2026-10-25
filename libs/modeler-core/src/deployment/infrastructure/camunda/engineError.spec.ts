import { describe, expect, it } from "vitest";

import { BasicAuth, OAuth2Auth } from "../../domain/deployment";
import { SecretRedactor } from "../../domain/secretRedactor";
import { engineErrorDetail, requestRedactor } from "./engineError";

const nothingToMask = SecretRedactor.none();

describe("engineErrorDetail", () => {
    describe("JSON bodies", () => {
        it("takes the message of a Camunda 7 exception", () => {
            const body = JSON.stringify({
                type: "ParseException",
                message: "ENGINE-09005 Could not parse BPMN process.",
            });

            expect(engineErrorDetail(body, nothingToMask)).toBe(
                "ENGINE-09005 Could not parse BPMN process.",
            );
        });

        it("takes the detail of a Camunda 8 problem rather than its title", () => {
            const body = JSON.stringify({
                type: "about:blank",
                title: "INVALID_ARGUMENT",
                status: 400,
                detail: "Expected to deploy at least one resource.",
                instance: "/v2/deployments",
            });

            expect(engineErrorDetail(body, nothingToMask)).toBe(
                "Expected to deploy at least one resource.",
            );
        });

        it("falls back to the title of a problem without detail", () => {
            const body = JSON.stringify({ title: "UNAUTHORIZED", status: 401 });

            expect(engineErrorDetail(body, nothingToMask)).toBe("UNAUTHORIZED");
        });

        it("prefers message over detail and title", () => {
            const body = JSON.stringify({
                title: "the title",
                detail: "the detail",
                message: "the message",
            });

            expect(engineErrorDetail(body, nothingToMask)).toBe("the message");
        });

        it("takes the OAuth error_description rather than the error code", () => {
            const body = JSON.stringify({
                error: "invalid_client",
                error_description: "Client authentication failed.",
            });

            expect(engineErrorDetail(body, nothingToMask)).toBe("Client authentication failed.");
        });

        it("falls back to the OAuth error code without a description", () => {
            const body = JSON.stringify({ error: "invalid_client" });

            expect(engineErrorDetail(body, nothingToMask)).toBe("invalid_client");
        });

        it("never stringifies a known field holding an object", () => {
            const body = JSON.stringify({
                message: { headers: { Authorization: "Basic YWRtaW46c2VjcmV0" } },
                detail: "Bad request.",
            });

            expect(engineErrorDetail(body, nothingToMask)).toBe("Bad request.");
        });

        it("drops an echo service's JSON that has no known message field", () => {
            const body = JSON.stringify({
                url: "https://gw.example/engine-rest/deployment/create?key=secret",
                headers: { Authorization: "Basic YWRtaW46c2VjcmV0" },
            });

            expect(engineErrorDetail(body, nothingToMask)).toBeUndefined();
        });

        it("drops a JSON array", () => {
            const body = JSON.stringify(["https://gw.example/engine-rest?key=secret"]);

            expect(engineErrorDetail(body, nothingToMask)).toBeUndefined();
        });

        it("masks secrets inside the message field", () => {
            const body = JSON.stringify({ message: "Invalid API key s3cr3t-key." });

            expect(engineErrorDetail(body, SecretRedactor.of("s3cr3t-key"))).toBe(
                "Invalid API key ***.",
            );
        });
    });

    describe("non-JSON bodies", () => {
        it("drops an HTML error page, even after leading whitespace", () => {
            const body =
                "\n  <!DOCTYPE html><html><head><title>502 Bad Gateway</title></head>" +
                "<body>GET /engine-rest?key=secret</body></html>";

            expect(engineErrorDetail(body, nothingToMask)).toBeUndefined();
        });

        it("keeps a short plain-text body", () => {
            expect(engineErrorDetail("Unauthorized", nothingToMask)).toBe("Unauthorized");
        });

        it("returns undefined for an empty or blank body", () => {
            expect(engineErrorDetail("", nothingToMask)).toBeUndefined();
            expect(engineErrorDetail(" \r\n\t ", nothingToMask)).toBeUndefined();
        });

        it("collapses line breaks and runs of whitespace into single spaces", () => {
            const body = "Deployment rejected:\n\tresource   order.bpmn\r\n  is invalid  ";

            expect(engineErrorDetail(body, nothingToMask)).toBe(
                "Deployment rejected: resource order.bpmn is invalid",
            );
        });
    });

    describe("length cap", () => {
        it("keeps a detail of exactly 1000 characters whole", () => {
            const body = "x".repeat(1000);

            expect(engineErrorDetail(body, nothingToMask)).toBe(body);
        });

        it("cuts a longer detail to 1000 characters followed by an ellipsis", () => {
            const detail = engineErrorDetail("x".repeat(1001), nothingToMask);

            expect(detail).toBe(`${"x".repeat(1000)}…`);
        });

        it("masks a secret straddling the cut-off before truncating", () => {
            const secret = "PREFIX-of-the-secret-value";
            const body = `${"x".repeat(990)}${secret} and more text after it`;

            const detail = engineErrorDetail(body, SecretRedactor.of(secret));

            expect(detail).not.toContain("PREFIX");
            expect(detail).toBe(`${"x".repeat(990)}*** and mo…`);
        });
    });
});

describe("requestRedactor", () => {
    it("masks an endpoint query value that the conventional route was appended to", () => {
        const endpoint = "https://gw.example/engine-rest?apikey=SECRET";
        const requestUrl = `${endpoint}/deployment/create`;

        const redactor = requestRedactor(nothingToMask, {}, requestUrl, endpoint);

        const echoedUrl = redactor.redact(`Forbidden: POST ${requestUrl}`);
        expect(echoedUrl).not.toContain("SECRET");
        expect(echoedUrl).toContain("https://gw.example/engine-rest?");
        expect(redactor.redact("Invalid API key: SECRET")).toBe("Invalid API key: ***");
    });

    it("keeps scheme, host and path of a URL without userinfo or query readable", () => {
        const requestUrl = "https://engine.example/engine-rest/deployment/create";

        const redactor = requestRedactor(nothingToMask, {}, requestUrl);

        expect(redactor.redact(`POST ${requestUrl} failed`)).toBe(`POST ${requestUrl} failed`);
    });

    it("masks the basic credentials both as typed and as the encoded Authorization header", () => {
        const auth = new BasicAuth("deployer", "pa55-word");
        const encoded = Buffer.from("deployer:pa55-word").toString("base64");

        const redacted = requestRedactor(
            auth.redactor(),
            auth.toHeaders(),
            "https://engine.example",
        ).redact(`Rejected "Authorization: Basic ${encoded}" (deployer / pa55-word)`);

        expect(redacted).not.toContain(encoded);
        expect(redacted).not.toContain("pa55-word");
        expect(redacted).not.toContain("deployer");
    });

    it("masks the bearer token and the OAuth client credentials", () => {
        const auth = new OAuth2Auth("svc-modeler", "oauth-secret", "https://idp.example/token", "");

        const redacted = requestRedactor(
            auth.redactor(),
            { Authorization: "Bearer eyJ.access.token" },
            "https://engine.example",
        ).redact("Token eyJ.access.token of svc-modeler (secret oauth-secret) expired");

        expect(redacted).toBe("Token *** of *** (secret ***) expired");
    });

    it("masks the request secrets it is given alongside the URLs and headers", () => {
        const requestSecrets = SecretRedactor.of("env-host.internal", "env-t0ken");
        const requestUrl = "https://env-host.internal/engine-rest/deployment/create";

        const redacted = requestRedactor(requestSecrets, {}, requestUrl).redact(
            `POST ${requestUrl} with env-t0ken failed`,
        );

        expect(redacted).not.toContain("env-host.internal");
        expect(redacted).not.toContain("env-t0ken");
        expect(redacted).toContain("/engine-rest/deployment/create");
    });
});
