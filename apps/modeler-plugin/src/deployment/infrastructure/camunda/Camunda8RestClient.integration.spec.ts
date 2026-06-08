import * as http from "http";
import { AddressInfo } from "net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FetchHttpClient } from "../FetchHttpClient";
import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { Camunda8RestClient } from "./Camunda8RestClient";
import { BasicAuth, DeploymentConfig, NoAuth, OAuth2Auth } from "@miragon/bpmn-modeler-core";
import { StartInstanceConfig } from "@miragon/bpmn-modeler-core";
import { DeploymentFailedError, StartInstanceFailedError } from "@miragon/bpmn-modeler-core";

/**
 * Integration tests for {@link Camunda8RestClient}.
 *
 * Spins up a local HTTP server to verify real request/response cycles
 * using the actual {@link FetchHttpClient} and {@link AuthHeaderResolver}.
 */
describe("Camunda8RestClient (integration)", () => {
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
     * Creates a C8 client wired with real {@link FetchHttpClient}.
     *
     * @param apiVersion Optional Camunda 8 REST API version prefix (defaults to `"v2"`).
     */
    function createClient(apiVersion?: string): Camunda8RestClient {
        const httpClient = new FetchHttpClient();
        const authResolver = new AuthHeaderResolver(httpClient);
        return new Camunda8RestClient(httpClient, authResolver, apiVersion);
    }

    // ── Deploy ──────────────────────────────────────────────────────────

    it("should deploy to C8 and return deploymentId from json.deploymentKey", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "key-99" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        const result = await client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]));

        expect(result.success).toBe(true);
        expect(result.deploymentId).toBe("key-99");
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
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await expect(client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]))).rejects.toThrow(
            DeploymentFailedError,
        );
    });

    // ── Start instance ──────────────────────────────────────────────────

    it("should start a C8 process instance with correct body shape", async () => {
        let receivedBody: Record<string, unknown> = {};

        handler = (req, body, res) => {
            expect(req.url).toBe("/v2/process-instances");
            receivedBody = JSON.parse(body.toString("utf-8"));
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ processInstanceKey: "pi-77" }));
        };

        const client = createClient();
        const config = new StartInstanceConfig("myProc", baseUrl, "c8", new NoAuth(), {
            foo: "bar",
        });

        const result = await client.startInstance(config);

        expect(result.success).toBe(true);
        expect(result.processInstanceId).toBe("pi-77");
        expect(receivedBody).toEqual({
            processDefinitionId: "myProc",
            variables: { foo: "bar" },
        });
    });

    it("should throw StartInstanceFailedError on non-2xx start response", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        };

        const client = createClient();
        const config = new StartInstanceConfig("missing", baseUrl, "c8", new NoAuth());

        await expect(client.startInstance(config)).rejects.toThrow(StartInstanceFailedError);
    });

    // ── Custom C8 API version ─────────────────────────────────────────

    it("should use custom API version in C8 deploy URL", async () => {
        let receivedUrl: string | undefined;

        handler = (req, _body, res) => {
            receivedUrl = req.url;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "key-v3" }));
        };

        const client = createClient("v3");
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]));

        expect(receivedUrl).toBe("/v3/deployments");
    });

    it("should use custom API version in C8 startInstance URL", async () => {
        let receivedUrl: string | undefined;

        handler = (req, _body, res) => {
            receivedUrl = req.url;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ processInstanceKey: "pi-v3" }));
        };

        const client = createClient("v3");
        const config = new StartInstanceConfig("myProc", baseUrl, "c8", new NoAuth());

        await client.startInstance(config);

        expect(receivedUrl).toBe("/v3/process-instances");
    });

    // ── Multipart body correctness ──────────────────────────────────────

    it("should use part name 'resources' for C8 file parts", async () => {
        let receivedBody = "";

        handler = (_req, body, res) => {
            receivedBody = body.toString("utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "key-1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["proc.bpmn", "<definitions/>"]]));

        expect(receivedBody).toContain('name="resources"; filename="proc.bpmn"');
        /**
         * The part name must be "resources", not the filename
         */
        expect(receivedBody).not.toContain('name="proc.bpmn"; filename=');
        expect(receivedBody).toContain("<definitions/>");
    });

    it("should include tenantId field for C8 when non-empty", async () => {
        let receivedBody = "";

        handler = (_req, body, res) => {
            receivedBody = body.toString("utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "key-2" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "my-tenant",
            baseUrl,
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["proc.bpmn", "<definitions/>"]]));

        expect(receivedBody).toContain('name="tenantId"');
        expect(receivedBody).toContain("my-tenant");
        /**
         * C8 should NOT include C7-specific fields
         */
        expect(receivedBody).not.toContain("deployment-name");
        expect(receivedBody).not.toContain("tenant-id");
    });

    it("should omit tenantId field for C8 when empty", async () => {
        let receivedBody = "";

        handler = (_req, body, res) => {
            receivedBody = body.toString("utf-8");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "key-3" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["proc.bpmn", "<definitions/>"]]));

        expect(receivedBody).not.toContain('name="tenantId"');
    });

    // ── Non-JSON response handling ──────────────────────────────────────

    it("should yield undefined deploymentId when the deploy response is not JSON", async () => {
        handler = (_req, _body, res) => {
            // A 2xx with a non-JSON body must still succeed but with no id.
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Created");
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "my-deploy",
            "",
            baseUrl,
            "c8",
            "/tmp/proc.bpmn",
            [],
            new NoAuth(),
        );

        const result = await client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]]));

        expect(result.success).toBe(true);
        expect(result.deploymentId).toBeUndefined();
    });

    it("should yield undefined processInstanceId when the start response is not JSON", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(200, { "Content-Type": "text/plain" });
            res.end("Started");
        };

        const client = createClient();
        const config = new StartInstanceConfig("myProc", baseUrl, "c8", new NoAuth());

        const result = await client.startInstance(config);

        expect(result.success).toBe(true);
        expect(result.processInstanceId).toBeUndefined();
    });

    // ── Endpoint normalization ──────────────────────────────────────────

    it("should hit the same deploy path whether the endpoint has a trailing slash or not", async () => {
        const seenPaths: string[] = [];

        handler = (req, _body, res) => {
            seenPaths.push(req.url ?? "");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "k" }));
        };

        const client = createClient();
        const files = new Map([["p.bpmn", "<b/>"]]);

        const withSlash = new DeploymentConfig(
            "d",
            "",
            `${baseUrl}/`,
            "c8",
            "/tmp/p.bpmn",
            [],
            new NoAuth(),
        );
        const withoutSlash = new DeploymentConfig(
            "d",
            "",
            baseUrl,
            "c8",
            "/tmp/p.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(withSlash, files);
        await client.deploy(withoutSlash, files);

        expect(seenPaths).toEqual(["/v2/deployments", "/v2/deployments"]);
    });

    // ── Auth headers ────────────────────────────────────────────────────

    it("should send BasicAuth header to the server", async () => {
        let authHeader: string | undefined;

        handler = (req, _body, res) => {
            authHeader = req.headers["authorization"] as string | undefined;
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ deploymentKey: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "deploy",
            "",
            baseUrl,
            "c8",
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
            res.end(JSON.stringify({ deploymentKey: "d1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "deploy",
            "",
            baseUrl,
            "c8",
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
            res.end(JSON.stringify({ deploymentKey: "1" }));
        };

        const client = createClient();
        const config = new DeploymentConfig(
            "deploy",
            "",
            baseUrl,
            "c8",
            "/tmp/p.bpmn",
            [],
            new NoAuth(),
        );

        await client.deploy(config, new Map([["p.bpmn", "<b/>"]]));

        expect(authHeader).toBeUndefined();
    });
});
