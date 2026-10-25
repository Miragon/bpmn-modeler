import * as http from "http";
import { AddressInfo } from "net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FetchHttpClient } from "../FetchHttpClient";
import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { Camunda7RestClient } from "./Camunda7RestClient";
import { BasicAuth, DeploymentConfig, NoAuth, OAuth2Auth } from "../../domain/deployment";
import { StartInstanceConfig } from "../../domain/startInstance";
import {
    DeploymentFailedError,
    EngineInspectionFailedError,
    StartInstanceFailedError,
} from "../../../shared/domain/errors";

function escapeHtml(value: string | undefined): string {
    return (value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Integration tests for {@link Camunda7RestClient}.
 *
 * Spins up a local HTTP server to verify real request/response cycles
 * using the actual {@link FetchHttpClient} and {@link AuthHeaderResolver}.
 */
describe("Camunda7RestClient (integration)", () => {
    let server: http.Server;
    let baseUrl: string;

    // Handler installed per-test; receives the raw request and body buffer.
    let handler: (req: http.IncomingMessage, body: Buffer, res: http.ServerResponse) => void;

    beforeAll(async () => {
        server = http.createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => handler(req, Buffer.concat(chunks), res));
        });

        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", resolve);
        });

        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        });
    });

    /**
     * Creates a C7 client wired with real {@link FetchHttpClient}.
     */
    function createClient(): Camunda7RestClient {
        const httpClient = new FetchHttpClient();
        const authResolver = new AuthHeaderResolver(httpClient);
        return new Camunda7RestClient(httpClient, authResolver);
    }

    // ── Deploy ──────────────────────────────────────────────────────────

    it("should deploy to C7 and return deploymentId from json.id", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "deploy-42" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        const result = await client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]));

        expect(result.success).toBe(true);
        expect(result.deploymentId).toBe("deploy-42");
    });

    it("should throw DeploymentFailedError on non-2xx deploy response", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(500, { "Content-Type": "text/plain" });
            res.end("Internal Server Error");
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await expect(client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]))).rejects.toThrow(
            DeploymentFailedError,
        );
    });

    // ── Start instance ──────────────────────────────────────────────────

    it("should start a C7 process instance", async () => {
        handler = (req, _body, res) => {
            expect(req.url).toBe("/process-definition/key/myProc/start");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "inst-1" }));
        };

        const client = createClient();
        const config = new StartInstanceConfig("myProc", baseUrl, "c7", new NoAuth());

        const result = await client.startInstance(config);

        expect(result.success).toBe(true);
        expect(result.processInstanceId).toBe("inst-1");
    });

    it("should post to the deployUrl override instead of the convention path", async () => {
        let requestedUrl: string | undefined;
        handler = (req, _body, res) => {
            requestedUrl = req.url;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
            `${baseUrl}/custom/deploy`,
        );

        await client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]));

        expect(requestedUrl).toBe("/custom/deploy");
    });

    it("should expand {processDefinitionKey} in the startInstanceUrl override", async () => {
        let requestedUrl: string | undefined;
        handler = (req, _body, res) => {
            requestedUrl = req.url;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "inst-1" }));
        };

        const client = createClient();
        const config = new StartInstanceConfig(
            "myProc",
            baseUrl,
            "c7",
            new NoAuth(),
            null,
            `${baseUrl}/custom/{processDefinitionKey}/start`,
        );

        await client.startInstance(config);

        expect(requestedUrl).toBe("/custom/myProc/start");
    });

    it("should throw StartInstanceFailedError on non-2xx start response", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        };

        const client = createClient();
        const config = new StartInstanceConfig("missing", baseUrl, "c7", new NoAuth());

        await expect(client.startInstance(config)).rejects.toThrow(StartInstanceFailedError);
    });

    // ── Auth headers ────────────────────────────────────────────────────

    it("should send BasicAuth header to the server", async () => {
        let authHeader: string | undefined;

        handler = (req, _body, res) => {
            authHeader = req.headers["authorization"] as string | undefined;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/p.bpmn",
            [],
            new BasicAuth("admin", "secret"),
        );

        await client.deploy(config, new Map([["p.bpmn", "<b/>"]]));

        const expected = Buffer.from("admin:secret").toString("base64");
        expect(authHeader).toBe(`Basic ${expected}`);
    });

    it("should complete OAuth2 flow end-to-end", async () => {
        let deployAuthHeader: string | undefined;

        handler = (req, body, res) => {
            /**
             * Token endpoint
             */
            if (req.url === "/oauth/token") {
                const params = new URLSearchParams(body.toString("utf-8"));
                expect(params.get("grant_type")).toBe("client_credentials");
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ access_token: "my-token" }));
                return;
            }

            // Deploy endpoint
            deployAuthHeader = req.headers["authorization"] as string | undefined;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "d1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/p.bpmn",
            [],
            new OAuth2Auth("cid", "csec", `${baseUrl}/oauth/token`, ""),
        );

        await client.deploy(config, new Map([["p.bpmn", "<b/>"]]));

        expect(deployAuthHeader).toBe("Bearer my-token");
    });

    it("should send no Authorization header for NoAuth", async () => {
        let authHeader: string | undefined;

        handler = (req, _body, res) => {
            authHeader = req.headers["authorization"] as string | undefined;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/p.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["p.bpmn", "<b/>"]]));

        expect(authHeader).toBeUndefined();
    });

    // ── Multipart body correctness ──────────────────────────────────────

    it("should include deployment-name, tenant-id, and file content in multipart body", async () => {
        let receivedBody = "";

        handler = (_req, body, res) => {
            receivedBody = body.toString("utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deployment",
            "tenant-a",
            baseUrl,
            "c7",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["proc.bpmn", "<definitions/>"]]));

        expect(receivedBody).toContain("deployment-name");
        expect(receivedBody).toContain("my-deployment");
        expect(receivedBody).toContain("tenant-id");
        expect(receivedBody).toContain("tenant-a");
        expect(receivedBody).toContain("proc.bpmn");
        expect(receivedBody).toContain("<definitions/>");
    });

    it("should use filename as part name for C7 file parts", async () => {
        let receivedBody = "";

        handler = (_req, body, res) => {
            receivedBody = body.toString("utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c7",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["proc.bpmn", "<definitions/>"]]));

        expect(receivedBody).toContain('name="proc.bpmn"; filename="proc.bpmn"');
        expect(receivedBody).not.toContain('name="resources"');
    });

    // ── Deployment lookup (fetchLatestDefinition) ───────────────────────

    const DEPLOYED_XML = '<bpmn:process id="order"/>ä';

    function installLookupHandler(opts: { withTenant?: boolean; deploymentStatus?: number } = {}) {
        const urls: string[] = [];
        handler = (req, _body, res) => {
            urls.push(req.url ?? "");
            const keyPath = opts.withTenant
                ? "/process-definition/key/order/tenant-id/acme"
                : "/process-definition/key/order";
            if (req.url === keyPath) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        id: "order:3:def-1",
                        deploymentId: "dep-9",
                        resource: "order.bpmn",
                        version: 3,
                    }),
                );
            } else if (req.url === "/process-definition/order%3A3%3Adef-1/xml") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ id: "order:3:def-1", bpmn20Xml: DEPLOYED_XML }));
            } else if (req.url === "/deployment/dep-9") {
                res.writeHead(opts.deploymentStatus ?? 200, {
                    "Content-Type": "application/json",
                });
                res.end(
                    JSON.stringify({ id: "dep-9", deploymentTime: "2026-09-17T14:40:00.000Z" }),
                );
            } else {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ type: "RestException", message: "not found" }));
            }
        };
        return urls;
    }

    it("fetches the latest definition, its XML bytes, and the deployment time", async () => {
        installLookupHandler();

        const snapshot = await createClient().fetchLatestDefinition({
            endpoint: `${baseUrl}/`,
            tenantId: "",
            processKey: "order",
            auth: new NoAuth(),
            envValues: [],
        });

        expect(snapshot).toEqual({
            processDefinitionId: "order:3:def-1",
            deploymentId: "dep-9",
            resourceName: "order.bpmn",
            xml: DEPLOYED_XML,
            deploymentTime: "2026-09-17T14:40:00.000Z",
        });
    });

    it("routes the lookup through the tenant path when the target has a tenant", async () => {
        const urls = installLookupHandler({ withTenant: true });

        const snapshot = await createClient().fetchLatestDefinition({
            endpoint: baseUrl,
            tenantId: "acme",
            processKey: "order",
            auth: new NoAuth(),
            envValues: [],
        });

        expect(urls[0]).toBe("/process-definition/key/order/tenant-id/acme");
        expect(snapshot?.deploymentId).toBe("dep-9");
    });

    it("returns undefined when the process key is not deployed (404)", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ type: "RestException", message: "no matching definition" }));
        };

        const snapshot = await createClient().fetchLatestDefinition({
            endpoint: baseUrl,
            tenantId: "",
            processKey: "missing",
            auth: new NoAuth(),
            envValues: [],
        });

        expect(snapshot).toBeUndefined();
    });

    it("throws EngineInspectionFailedError flagged as auth failure on 401", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(401, { "Content-Type": "text/plain" });
            res.end("Unauthorized");
        };

        const lookup = createClient().fetchLatestDefinition({
            endpoint: baseUrl,
            tenantId: "",
            processKey: "order",
            auth: new NoAuth(),
            envValues: [],
        });

        await expect(lookup).rejects.toSatisfy(
            (error: unknown) => error instanceof EngineInspectionFailedError && error.isAuthFailure,
        );
    });

    it("leaves deploymentTime undefined when the deployment lookup fails", async () => {
        installLookupHandler({ deploymentStatus: 500 });

        const snapshot = await createClient().fetchLatestDefinition({
            endpoint: baseUrl,
            tenantId: "",
            processKey: "order",
            auth: new NoAuth(),
            envValues: [],
        });

        expect(snapshot?.deploymentTime).toBeUndefined();
        expect(snapshot?.xml).toBe(DEPLOYED_XML);
    });

    // ── Error bodies ────────────────────────────────────────────────────

    describe("error bodies", () => {
        const apiKey = "q-SECRET-4711";
        const basicAuth = new BasicAuth("deployer", "pa55-word");
        const encodedCredentials = Buffer.from("deployer:pa55-word").toString("base64");

        function echoRequestAsEngineError(status: number) {
            handler = (req, _body, res) => {
                res.writeHead(status, { "Content-Type": "application/json" });
                res.end(
                    JSON.stringify({
                        type: "AuthorizationException",
                        message: `Rejected ${req.method} ${req.url} with ${req.headers.authorization}`,
                    }),
                );
            };
        }

        async function rejectionOf(operation: Promise<unknown>): Promise<Error> {
            return operation.then(
                () => {
                    throw new Error("expected the request to fail");
                },
                (error: Error) => error,
            );
        }

        it("masks the query secret and the Authorization header a gateway echoes on deploy", async () => {
            echoRequestAsEngineError(403);
            const config = new DeploymentConfig(
                "my-deploy",
                "",
                `${baseUrl}/engine-rest?apikey=${apiKey}`,
                "c7",
                "/tmp/proc.bpmn",
                [],
                basicAuth,
            );

            const error = await rejectionOf(
                createClient().deploy(config, new Map([["proc.bpmn", "<bpmn/>"]])),
            );

            expect(error).toBeInstanceOf(DeploymentFailedError);
            expect(error.message).toMatch(/^Deployment failed with HTTP 403: Rejected POST /);
            expect(error.message).not.toContain(apiKey);
            expect(error.message).not.toContain(encodedCredentials);
        });

        it("masks the basic password a server echoes in a plain-text start-instance error", async () => {
            handler = (_req, _body, res) => {
                res.writeHead(401, { "Content-Type": "text/plain" });
                res.end("Bad credentials: deployer / pa55-word");
            };
            const config = new StartInstanceConfig("myProc", baseUrl, "c7", basicAuth);

            const error = await rejectionOf(createClient().startInstance(config));

            expect(error).toBeInstanceOf(StartInstanceFailedError);
            expect(error.message).toContain("HTTP 401: Bad credentials:");
            expect(error.message).not.toContain("pa55-word");
        });

        it("masks the query secret and the Authorization header in an inspection error", async () => {
            echoRequestAsEngineError(403);

            const error = await rejectionOf(
                createClient().fetchLatestDefinition({
                    endpoint: `${baseUrl}/engine-rest?apikey=${apiKey}`,
                    tenantId: "",
                    processKey: "order",
                    auth: basicAuth,
                    envValues: [],
                }),
            );

            expect(error).toBeInstanceOf(EngineInspectionFailedError);
            expect(error.message).toMatch(
                /^Deployment verification failed with HTTP 403: Rejected GET /,
            );
            expect(error.message).not.toContain(apiKey);
            expect(error.message).not.toContain(encodedCredentials);
        });

        it("masks a .env value a gateway echoes from the deploy URL path", async () => {
            const envValue = "t3nant-gw-key";
            echoRequestAsEngineError(403);
            const config = new DeploymentConfig(
                "my-deploy",
                "",
                `${baseUrl}/engine-rest`,
                "c7",
                "/tmp/proc.bpmn",
                [],
                new NoAuth(),
                `${baseUrl}/gw/${envValue}/deployment/create`,
                [envValue],
            );

            const error = await rejectionOf(
                createClient().deploy(config, new Map([["proc.bpmn", "<bpmn/>"]])),
            );

            expect(error).toBeInstanceOf(DeploymentFailedError);
            expect(error.message).toMatch(/^Deployment failed with HTTP 403: Rejected POST /);
            expect(error.message).not.toContain(envValue);
        });

        it("masks a .env value a server echoes in an inspection error", async () => {
            const envValue = "t3nant-gw-key";
            echoRequestAsEngineError(403);

            const error = await rejectionOf(
                createClient().fetchLatestDefinition({
                    endpoint: `${baseUrl}/gw/${envValue}/engine-rest`,
                    tenantId: "",
                    processKey: "order",
                    auth: new NoAuth(),
                    envValues: [envValue],
                }),
            );

            expect(error).toBeInstanceOf(EngineInspectionFailedError);
            expect(error.message).toMatch(
                /^Deployment verification failed with HTTP 403: Rejected GET \/gw\//,
            );
            expect(error.message).not.toContain(envValue);
        });

        it("reports only the status for an HTML error page", async () => {
            handler = (req, _body, res) => {
                res.writeHead(502, { "Content-Type": "text/html" });
                res.end(
                    `<html><head><title>502 Bad Gateway</title></head><body>${escapeHtml(req.url)} ${escapeHtml(req.headers.authorization)}</body></html>`,
                );
            };
            const config = new DeploymentConfig(
                "my-deploy",
                "",
                baseUrl,
                "c7",
                "/tmp/proc.bpmn",
                [],
                basicAuth,
            );

            await expect(
                createClient().deploy(config, new Map([["proc.bpmn", "<bpmn/>"]])),
            ).rejects.toThrow(/^Deployment failed with HTTP 502\.$/);
        });
    });
});
