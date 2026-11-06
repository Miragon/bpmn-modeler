import { beforeEach, describe, expect, it } from "vitest";

import { TokenStorePort } from "../template-marketplace/port/marketplacePorts";

/**
 * The rules of {@link TokenStorePort} the core relies on, run against one
 * adapter: a token comes back as saved, the next save replaces it (a token
 * rotates that way), and a token saved for one host is never returned for
 * another. Hosts are spelled as `hostForConfig` gives them: a URL's host, with
 * its port when it has one.
 *
 * Left out:
 * - How often a read reaches the keychain: reading only after an auth failure
 *   is the caller's rule (`HostTokenSession`), not the store's.
 * - A blank token: the core never saves one (`enteredToken`).
 */
export function describeTokenStoreContract(
    adapter: string,
    createStore: () => Promise<TokenStorePort>,
): void {
    describe(`${adapter} keeps the TokenStorePort contract`, () => {
        let store: TokenStorePort;

        beforeEach(async () => {
            store = await createStore();
        });

        it("returns undefined for a host without a token", async () => {
            await expect(store.getToken("github.com")).resolves.toBeUndefined();
        });

        it("returns the token saved for a host", async () => {
            await store.setToken("github.com", "ghp_saved");

            await expect(store.getToken("github.com")).resolves.toBe("ghp_saved");
        });

        it("replaces a host's token on the next save, which is how a token rotates", async () => {
            await store.setToken("github.com", "ghp_old");

            await store.setToken("github.com", "ghp_new");

            await expect(store.getToken("github.com")).resolves.toBe("ghp_new");
        });

        it.each([
            { behaviour: "github.com and gitlab.com", saved: "github.com", other: "gitlab.com" },
            {
                behaviour: "github.com and a self-hosted host whose name starts like it",
                saved: "github.com",
                other: "github.example.com",
            },
            {
                behaviour: "one host on two ports",
                saved: "git.example.com",
                other: "git.example.com:8443",
            },
        ])("keeps the tokens of $behaviour apart", async ({ saved, other }) => {
            await store.setToken(saved, "token-saved");

            await expect(store.getToken(other)).resolves.toBeUndefined();

            await store.setToken(other, "token-other");

            await expect(store.getToken(saved)).resolves.toBe("token-saved");
            await expect(store.getToken(other)).resolves.toBe("token-other");
        });
    });
}
