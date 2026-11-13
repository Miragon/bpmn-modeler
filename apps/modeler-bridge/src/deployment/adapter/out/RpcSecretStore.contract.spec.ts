import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describeSecretStoreContract } from "@miragon/bpmn-modeler-core/testing";
import { describe, expect, it } from "vitest";

import { intellijCredentialHost } from "../../../__fixtures__/intellijCredentialHost";
import { RpcSecretStore } from "./RpcSecretStore";

interface PasswordSafeCase {
    readonly name: string;
    readonly save: { readonly method: string; readonly params: Record<string, string> };
    readonly read: string;
    readonly result: unknown;
}

const PASSWORD_SAFE_CASES = (
    JSON.parse(
        readFileSync(
            resolve(__dirname, "../../../__fixtures__/intellijPasswordSafe.cases.json"),
            "utf8",
        ),
    ) as { cases: PasswordSafeCase[] }
).cases;

const SLOT = "/ws/.camunda/deployment-targets.json::dev";

describeSecretStoreContract(
    "RpcSecretStore answered as the IntelliJ host answers",
    async () => new RpcSecretStore(intellijCredentialHost()),
);

describe("intellijCredentialHost answers the rows SecretStoreRouterTest runs", () => {
    it.each(PASSWORD_SAFE_CASES)("$name", async ({ save, read, result }) => {
        const host = intellijCredentialHost();

        await host.request(save.method, { ...save.params, slot: SLOT });

        await expect(host.request(read, { slot: SLOT })).resolves.toEqual(result);
    });
});
