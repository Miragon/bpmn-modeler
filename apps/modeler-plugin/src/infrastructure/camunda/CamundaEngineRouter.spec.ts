import { Mocked, beforeEach, describe, expect, it, vi } from "vitest";

import { CamundaEngineRouter } from "./CamundaEngineRouter";
import { CamundaEnginePort } from "../../domain/ports";
import { DeploymentConfig, DeploymentResult, NoAuth } from "../../domain/deployment";
import { StartInstanceConfig, StartInstanceResult } from "../../domain/startInstance";

function mockEnginePort(): Mocked<CamundaEnginePort> {
    return {
        deploy: vi.fn(),
        startInstance: vi.fn(),
    };
}

/**
 * Unit tests for {@link CamundaEngineRouter}.
 *
 * Verifies that deploy and startInstance calls are dispatched to the
 * correct engine-specific implementation based on `config.engine`.
 */
describe("CamundaEngineRouter", () => {
    let c7: Mocked<CamundaEnginePort>;
    let c8: Mocked<CamundaEnginePort>;
    let router: CamundaEngineRouter;

    beforeEach(() => {
        c7 = mockEnginePort();
        c8 = mockEnginePort();
        router = new CamundaEngineRouter(c7, c8);
    });

    // ── deploy ──────────────────────────────────────────────────────────

    it("should route C7 deploy to c7 client", async () => {
        const expectedResult = new DeploymentResult(true, "ok", "d1");
        c7.deploy.mockResolvedValue(expectedResult);

        const config = new DeploymentConfig(
            "deploy",
            "",
            "http://localhost",
            "c7",
            "/tmp/p.bpmn",
            [],
            new NoAuth(),
        );
        const files = new Map([["p.bpmn", "<b/>"]]);

        const result = await router.deploy(config, files);

        expect(result).toBe(expectedResult);
        expect(c7.deploy).toHaveBeenCalledWith(config, files);
        expect(c8.deploy).not.toHaveBeenCalled();
    });

    it("should route C8 deploy to c8 client", async () => {
        const expectedResult = new DeploymentResult(true, "ok", "d2");
        c8.deploy.mockResolvedValue(expectedResult);

        const config = new DeploymentConfig(
            "deploy",
            "",
            "http://localhost",
            "c8",
            "/tmp/p.bpmn",
            [],
            new NoAuth(),
        );
        const files = new Map([["p.bpmn", "<b/>"]]);

        const result = await router.deploy(config, files);

        expect(result).toBe(expectedResult);
        expect(c8.deploy).toHaveBeenCalledWith(config, files);
        expect(c7.deploy).not.toHaveBeenCalled();
    });

    // ── startInstance ───────────────────────────────────────────────────

    it("should route C7 startInstance to c7 client", async () => {
        const expectedResult = new StartInstanceResult(true, "ok", "i1");
        c7.startInstance.mockResolvedValue(expectedResult);

        const config = new StartInstanceConfig(
            "myProc",
            "http://localhost",
            "c7",
            new NoAuth(),
        );

        const result = await router.startInstance(config);

        expect(result).toBe(expectedResult);
        expect(c7.startInstance).toHaveBeenCalledWith(config);
        expect(c8.startInstance).not.toHaveBeenCalled();
    });

    it("should route C8 startInstance to c8 client", async () => {
        const expectedResult = new StartInstanceResult(true, "ok", "i2");
        c8.startInstance.mockResolvedValue(expectedResult);

        const config = new StartInstanceConfig(
            "myProc",
            "http://localhost",
            "c8",
            new NoAuth(),
        );

        const result = await router.startInstance(config);

        expect(result).toBe(expectedResult);
        expect(c8.startInstance).toHaveBeenCalledWith(config);
        expect(c7.startInstance).not.toHaveBeenCalled();
    });
});
