import { beforeEach, describe, expect, it } from "vitest";

import { SecretStorePort } from "../deployment/port/deploymentPorts";

/** Slots as `targetSecretSlot` spells them: `<targetsFilePath>::<name>`. */
const DEV = "/ws/.camunda/deployment-targets.json::dev";
const PROD = "/ws/.camunda/deployment-targets.json::prod";
/** Where the ad-hoc connection keeps its approvals; its credentials have no slot. */
const AD_HOC_APPROVALS = "ad-hoc";

interface CredentialKind {
    readonly kind: string;
    save(store: SecretStorePort, name: string, secret: string, slot?: string): Promise<void>;
    read(store: SecretStorePort, slot?: string): Promise<unknown>;
    pair(name: string, secret: string): unknown;
}

const BASIC_AUTH: CredentialKind = {
    kind: "basic-auth",
    save: (store, name, secret, slot) => store.saveBasicAuth(name, secret, slot),
    read: (store, slot) => store.getBasicAuth(slot),
    pair: (username, password) => ({ username, password }),
};

const OAUTH2: CredentialKind = {
    kind: "OAuth2",
    save: (store, name, secret, slot) => store.saveOAuth2(name, secret, slot),
    read: (store, slot) => store.getOAuth2(slot),
    pair: (clientId, clientSecret) => ({ clientId, clientSecret }),
};

const sorted = (origins: readonly string[]) => [...origins].sort();

/**
 * The rules of {@link SecretStorePort} the core relies on, run against one
 * adapter: a pair or an approval comes back as saved, a second save replaces
 * it, and nothing saved for one slot, the unnamed ad-hoc one included, is
 * returned for another or removed with it. A pair with an empty half replaces
 * the earlier one too: it may come back as saved, as in VS Code, or not at all,
 * as IntelliJ reads a pair with an empty name back as absent; the core
 * stores a target's env references beside its literals to cope with the
 * second, so both pass. The earlier pair or a part never does: a password the
 * user cleared would still be sent on the next deploy.
 *
 * Left out:
 * - "Both halves or neither" and a store that rejects: only a host-specific
 *   fault can show them, so each adapter's own spec covers its failures.
 * - Pairs earlier releases stored under two keys and corrupt entries: only
 *   VS Code has them.
 * - The order of the approved origins: the core reads them as a set.
 */
export function describeSecretStoreContract(
    adapter: string,
    createStore: () => Promise<SecretStorePort>,
): void {
    describe(`${adapter} keeps the SecretStorePort contract`, () => {
        let store: SecretStorePort;

        beforeEach(async () => {
            store = await createStore();
        });

        describe.each([BASIC_AUTH, OAUTH2])("$kind credentials", (credentials) => {
            it.each([
                { slot: DEV, label: "a target" },
                { slot: undefined, label: "the ad-hoc connection" },
            ])("returns undefined for $label when nothing is saved", async ({ slot }) => {
                await expect(credentials.read(store, slot)).resolves.toBeUndefined();
            });

            it.each([
                { slot: DEV, label: "a target's slot" },
                { slot: undefined, label: "no slot, as the ad-hoc connection saves them" },
            ])("returns the pair saved under $label", async ({ slot }) => {
                await credentials.save(store, "demo", "secret", slot);

                await expect(credentials.read(store, slot)).resolves.toEqual(
                    credentials.pair("demo", "secret"),
                );
            });

            it("replaces both halves on the next save", async () => {
                await credentials.save(store, "old-name", "old-secret", DEV);

                await credentials.save(store, "new-name", "new-secret", DEV);

                await expect(credentials.read(store, DEV)).resolves.toEqual(
                    credentials.pair("new-name", "new-secret"),
                );
            });

            it.each([
                {
                    value: "an env reference stored in place of a literal",
                    secret: "${env:MIRAGON_DEPLOY_SECRET}",
                },
                { value: "characters a store may escape", secret: 'p@ss:w\\rd "quoted"' },
                { value: "non-ASCII characters", secret: "pässwört ✓" },
            ])("returns $value as saved", async ({ secret }) => {
                await credentials.save(store, secret, secret, DEV);

                await expect(credentials.read(store, DEV)).resolves.toEqual(
                    credentials.pair(secret, secret),
                );
            });

            it.each([
                { half: "secret", name: "demo", secret: "" },
                { half: "name", name: "", secret: "secret" },
            ])(
                "replaces an earlier pair with one that has an empty $half: as saved or not at all, never the old pair or a part",
                async ({ name, secret }) => {
                    await credentials.save(store, "old-name", "old-secret", DEV);

                    await credentials.save(store, name, secret, DEV);

                    expect([credentials.pair(name, secret), undefined]).toContainEqual(
                        await credentials.read(store, DEV),
                    );
                },
            );
        });

        it("keeps a slot's basic-auth and OAuth2 pairs apart", async () => {
            await store.saveBasicAuth("user", "password", DEV);

            await expect(store.getOAuth2(DEV)).resolves.toBeUndefined();

            await store.saveOAuth2("client", "client-secret", DEV);

            await expect(store.getBasicAuth(DEV)).resolves.toEqual({
                username: "user",
                password: "password",
            });
            await expect(store.getOAuth2(DEV)).resolves.toEqual({
                clientId: "client",
                clientSecret: "client-secret",
            });
        });

        it.each([
            { behaviour: "two targets of one file", saved: DEV, other: PROD },
            {
                behaviour: "one target name in two projects' files",
                saved: "/ws-a/.camunda/deployment-targets.json::dev",
                other: "/ws-b/.camunda/deployment-targets.json::dev",
            },
            {
                behaviour: "a target and one whose name starts with its name",
                saved: DEV,
                other: `${DEV}-eu`,
            },
            { behaviour: "the ad-hoc connection and a target", saved: undefined, other: DEV },
            { behaviour: "a target and the ad-hoc connection", saved: DEV, other: undefined },
        ])("keeps the credentials of $behaviour apart", async ({ saved, other }) => {
            await store.saveBasicAuth("saved-user", "saved-password", saved);
            await store.saveOAuth2("saved-client", "saved-secret", saved);

            await expect(store.getBasicAuth(other)).resolves.toBeUndefined();
            await expect(store.getOAuth2(other)).resolves.toBeUndefined();

            await store.saveBasicAuth("other-user", "other-password", other);
            await store.saveOAuth2("other-client", "other-secret", other);

            await expect(store.getBasicAuth(saved)).resolves.toEqual({
                username: "saved-user",
                password: "saved-password",
            });
            await expect(store.getOAuth2(saved)).resolves.toEqual({
                clientId: "saved-client",
                clientSecret: "saved-secret",
            });
            await expect(store.getBasicAuth(other)).resolves.toEqual({
                username: "other-user",
                password: "other-password",
            });
        });

        describe("approved destinations", () => {
            it("approves nothing for a slot never saved", async () => {
                await expect(store.getApprovedDestinations(DEV)).resolves.toEqual([]);
            });

            it("returns the origins saved for a slot", async () => {
                await store.saveApprovedDestinations(DEV, [
                    "https://engine.example",
                    "https://login.example:8443",
                ]);

                expect(sorted(await store.getApprovedDestinations(DEV))).toEqual([
                    "https://engine.example",
                    "https://login.example:8443",
                ]);
            });

            it("replaces the slot's origins on the next save, so an approval can be withdrawn", async () => {
                await store.saveApprovedDestinations(DEV, [
                    "https://engine.example",
                    "https://login.example",
                ]);

                await store.saveApprovedDestinations(DEV, ["https://login.example"]);
                await expect(store.getApprovedDestinations(DEV)).resolves.toEqual([
                    "https://login.example",
                ]);

                await store.saveApprovedDestinations(DEV, []);
                await expect(store.getApprovedDestinations(DEV)).resolves.toEqual([]);
            });

            it.each([
                { behaviour: "two targets of one file", saved: DEV, other: PROD },
                {
                    behaviour: "one target name in two projects' files",
                    saved: "/ws-a/.camunda/deployment-targets.json::dev",
                    other: "/ws-b/.camunda/deployment-targets.json::dev",
                },
                {
                    behaviour: "the ad-hoc connection and a target",
                    saved: AD_HOC_APPROVALS,
                    other: DEV,
                },
            ])("keeps the approvals of $behaviour apart", async ({ saved, other }) => {
                await store.saveApprovedDestinations(saved, ["https://saved.example"]);

                await expect(store.getApprovedDestinations(other)).resolves.toEqual([]);

                await store.saveApprovedDestinations(other, ["https://other.example"]);

                await expect(store.getApprovedDestinations(saved)).resolves.toEqual([
                    "https://saved.example",
                ]);
            });

            it("keeps a slot's approvals and credentials apart", async () => {
                await store.saveApprovedDestinations(DEV, ["https://engine.example"]);

                await expect(store.getBasicAuth(DEV)).resolves.toBeUndefined();
                await expect(store.getOAuth2(DEV)).resolves.toBeUndefined();

                await store.saveBasicAuth("demo", "secret", PROD);

                await expect(store.getApprovedDestinations(PROD)).resolves.toEqual([]);
            });
        });

        describe("delete", () => {
            it("removes both credential pairs and the approvals of the slot", async () => {
                await store.saveBasicAuth("demo", "secret", DEV);
                await store.saveOAuth2("client", "client-secret", DEV);
                await store.saveApprovedDestinations(DEV, ["https://engine.example"]);

                await store.delete(DEV);

                await expect(store.getBasicAuth(DEV)).resolves.toBeUndefined();
                await expect(store.getOAuth2(DEV)).resolves.toBeUndefined();
                await expect(store.getApprovedDestinations(DEV)).resolves.toEqual([]);
            });

            it("leaves every other slot and the ad-hoc credentials in place", async () => {
                const others = [PROD, `${DEV}-eu`, undefined];
                for (const slot of [DEV, ...others]) {
                    await store.saveBasicAuth("demo", `secret of ${slot}`, slot);
                    await store.saveOAuth2("client", `secret of ${slot}`, slot);
                }
                await store.saveApprovedDestinations(DEV, ["https://dev.example"]);
                await store.saveApprovedDestinations(PROD, ["https://prod.example"]);

                await store.delete(DEV);

                for (const slot of others) {
                    await expect(store.getBasicAuth(slot)).resolves.toEqual({
                        username: "demo",
                        password: `secret of ${slot}`,
                    });
                    await expect(store.getOAuth2(slot)).resolves.toEqual({
                        clientId: "client",
                        clientSecret: `secret of ${slot}`,
                    });
                }
                await expect(store.getApprovedDestinations(PROD)).resolves.toEqual([
                    "https://prod.example",
                ]);
            });

            it("resolves for a slot that holds nothing, as a renamed target without credentials leaves", async () => {
                await expect(store.delete(DEV)).resolves.toBeUndefined();
            });
        });
    });
}
