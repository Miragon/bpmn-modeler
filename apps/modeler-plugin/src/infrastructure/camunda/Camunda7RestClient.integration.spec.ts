import * as http from "http";
import { AddressInfo } from "net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { FetchHttpClient } from "../FetchHttpClient";
import { AuthHeaderResolver } from "./AuthHeaderResolver";
import { Camunda7RestClient } from "./Camunda7RestClient";
import {
    BasicAuth,
    DeploymentConfig,
    NoAuth,
    OAuth2Auth,
} from "../../domain/deployment";
import { StartInstanceConfig } from "../../domain/startInstance";
import { DeploymentFailedError, StartInstanceFailedError } from "../../domain/errors";

/**
 * Integration tests for {@link Camunda7RestClient}.
 *
 * Spins up a local HTTP server to verify real request/response cycles
 * using the actual {@link FetchHttpClient} and {@link AuthHeaderResolver}.
 */
describe("Camunda7RestClient (integration)", () => {
    let server: http.Server;
    let baseUrl: string;

    /** Handler installed per-test; receives the raw request and body buffer. */
    let handler: (
        req: http.IncomingMessage,
        body: Buffer,
        res: http.ServerResponse,
    ) => void;

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

        await expect(
            client.deploy(config, new Map([["proc.bpmn", "<bpmn/>"]])),
        ).rejects.toThrow(DeploymentFailedError);
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

    it("should throw StartInstanceFailedError on non-2xx start response", async () => {
        handler = (_req, _body, res) => {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not Found");
        };

        const client = createClient();
        const config = new StartInstanceConfig("missing", baseUrl, "c7", new NoAuth());

        await expect(client.startInstance(config)).rejects.toThrow(
            StartInstanceFailedError,
        );
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
            // Token endpoint
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
});
