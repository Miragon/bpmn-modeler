import { describe, expect, it } from "vitest";

import { createTestHost } from "../../testing";
import { RepositoryAccessError, RepositorySourceConfig } from "../domain/ports";
import { HostTokenSession } from "./HostTokenSession";

const GITHUB_MARKETPLACE: RepositorySourceConfig = {
    kind: "github",
    owner: "acme",
    repo: "templates",
    path: "",
};
const GITHUB_SOURCE_ONE: RepositorySourceConfig = {
    kind: "github",
    owner: "acme",
    repo: "one",
    path: "a",
};
const GITHUB_SOURCE_TWO: RepositorySourceConfig = {
    kind: "github",
    owner: "acme",
    repo: "two",
    path: "b",
};
const LOCAL_FOLDER: RepositorySourceConfig = { kind: "local", rootDir: "/opt/ext", path: "" };
const GITLAB_PROJECT: RepositorySourceConfig = {
    kind: "gitlab",
    projectPath: "group/proj",
    path: "",
};
const SELF_HOSTED_GITLAB_PROJECT: RepositorySourceConfig = {
    ...GITLAB_PROJECT,
    baseUrl: "https://gitlab.acme.com",
};

const PRIVATE_REPO_404 = new RepositoryAccessError("github.com", 404, "acme/templates", false);
const OUTSIDE_GRANT_403 = new RepositoryAccessError("github.com", 403, "acme/one", false);
const TOKEN_REJECTED_401 = new RepositoryAccessError("github.com", 401, "acme/templates", false);
const OFFLINE = new Error("offline");

/** `storedTokens` seeds the token store; `tokenAnswers` scripts the prompt (an unanswered host declines). */
function sessionOver({
    tokenAnswers,
    storedTokens = {},
}: { tokenAnswers?: Record<string, string>; storedTokens?: Record<string, string> } = {}) {
    const host = createTestHost({ tokenAnswers });
    for (const [tokenHost, token] of Object.entries(storedTokens)) {
        host.tokens.tokens.set(tokenHost, token);
    }
    return {
        session: new HostTokenSession(host.tokens, host.tokenPrompt, host.notifier),
        tokens: host.tokens,
        tokenPrompt: host.tokenPrompt,
        notifier: host.notifier,
    };
}

/**
 * A fetch that serves only when `admits` accepts the token its config carries
 * (`undefined` = anonymous) and otherwise throws `denial`. `attempts` records
 * that token per try, `configs` the config itself.
 */
function fakeFetch(
    admits: (token: string | undefined) => boolean,
    denial: Error = PRIVATE_REPO_404,
) {
    const attempts: (string | undefined)[] = [];
    const configs: RepositorySourceConfig[] = [];
    return {
        attempts,
        configs,
        task: async (config: RepositorySourceConfig): Promise<string> => {
            configs.push(config);
            const token = config.kind === "local" ? undefined : config.token;
            attempts.push(token);
            if (!admits(token)) {
                throw denial;
            }
            return "served";
        },
    };
}

/** A fetch whose n-th attempt meets the n-th outcome: an error to throw, or `"served"`. */
function scriptedFetch(...outcomes: (Error | "served")[]) {
    const attempts: (string | undefined)[] = [];
    return {
        attempts,
        task: async (config: RepositorySourceConfig): Promise<string> => {
            attempts.push(config.kind === "local" ? undefined : config.token);
            const outcome = outcomes[attempts.length - 1];
            if (outcome instanceof Error) {
                throw outcome;
            }
            return outcome;
        },
    };
}

/** The masked input the session asks the host to show for `host`, its text matched by `prompt`. */
const expectedPromptFor = (host: string, prompt: RegExp) => ({
    host,
    title: `Personal Access Token for ${host}`,
    prompt: expect.stringMatching(prompt),
    password: true,
});

/** `rejects.toThrow(regex)` also passes for an `undefined` rejection, so match the error itself. */
const errorWithMessage = (pattern: RegExp) =>
    expect.objectContaining({ message: expect.stringMatching(pattern) });

async function rejectionOf(run: Promise<unknown>): Promise<Error> {
    try {
        await run;
    } catch (error) {
        return error as Error;
    }
    throw new Error("expected the run to reject");
}

const anyone = () => true;
const nobody = () => false;
const anonymousOnly = (token: string | undefined) => token === undefined;
const only = (accepted: string) => (token: string | undefined) => token === accepted;

describe("HostTokenSession.run", () => {
    it("reads the stored token only after an auth failure and never places it on a local config", async () => {
        const { session, tokens, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "unused" },
            storedTokens: { "github.com": "stored-tok" },
        });
        const privateRepo = fakeFetch(only("stored-tok"));
        const localFolder = fakeFetch(anyone);

        await expect(session.run(GITHUB_MARKETPLACE, privateRepo.task)).resolves.toBe("served");
        await expect(session.run(LOCAL_FOLDER, localFolder.task)).resolves.toBe("served");

        expect(privateRepo.attempts).toEqual([undefined, "stored-tok"]);
        expect(localFolder.configs).toStrictEqual([LOCAL_FOLDER]);
        // The store is read once (lazily, after the anonymous 404), never prompted.
        expect(tokens.reads).toEqual(["github.com"]);
        expect(tokenPrompt.prompts).toEqual([]);
    });

    it.each<{
        rung: string;
        storedTokens: Record<string, string>;
        tokenAnswers: Record<string, string>;
        script: Error[];
        reads: string[];
        prompts: number;
    }>([
        {
            rung: "the first attempt",
            storedTokens: { "github.com": "stored-tok" },
            tokenAnswers: {},
            script: [OFFLINE],
            reads: [],
            prompts: 0,
        },
        {
            rung: "the stored-token attempt",
            storedTokens: { "github.com": "stored-tok" },
            tokenAnswers: {},
            script: [PRIVATE_REPO_404, OFFLINE],
            reads: ["github.com"],
            prompts: 0,
        },
        {
            rung: "the retry with a new token",
            storedTokens: {},
            tokenAnswers: { "github.com": "new" },
            script: [PRIVATE_REPO_404, OFFLINE],
            reads: ["github.com"],
            prompts: 1,
        },
    ])(
        "passes a failure that is not an access denial through untouched from $rung",
        async ({ storedTokens, tokenAnswers, script, reads, prompts }) => {
            const { session, tokens, tokenPrompt } = sessionOver({ storedTokens, tokenAnswers });

            await expect(
                session.run(GITHUB_MARKETPLACE, scriptedFetch(...script).task),
            ).rejects.toBe(OFFLINE);
            expect(tokens.reads).toEqual(reads);
            expect(tokenPrompt.prompts).toHaveLength(prompts);
        },
    );

    it("passes a failure that is not an access denial through untouched from the anonymous retry", async () => {
        const { session, tokenPrompt } = sessionOver({
            storedTokens: { "github.com": "stored-tok" },
        });
        await session.run(GITHUB_MARKETPLACE, fakeFetch(only("stored-tok")).task);

        await expect(
            session.run(GITHUB_SOURCE_ONE, scriptedFetch(OUTSIDE_GRANT_403, OFFLINE).task),
        ).rejects.toBe(OFFLINE);
        expect(tokenPrompt.prompts).toEqual([]);
    });

    it("never reads the store for a local folder, even on an access-shaped failure", async () => {
        const { session, tokens, tokenPrompt } = sessionOver({
            storedTokens: { "github.com": "stored-tok" },
        });

        await expect(session.run(LOCAL_FOLDER, fakeFetch(nobody).task)).rejects.toBe(
            PRIVATE_REPO_404,
        );
        expect(tokens.reads).toEqual([]);
        expect(tokenPrompt.prompts).toEqual([]);
    });

    it("prompts on a private-repo 404, stores the token, retries once, and never logs it", async () => {
        const { session, tokens, tokenPrompt, notifier } = sessionOver({
            tokenAnswers: { "github.com": "granted" },
        });
        const privateRepo = fakeFetch(only("granted"));

        await expect(session.run(GITHUB_MARKETPLACE, privateRepo.task)).resolves.toBe("served");

        expect(privateRepo.attempts).toEqual([undefined, "granted"]);
        expect(tokenPrompt.prompts).toEqual([expectedPromptFor("github.com", /may be private/)]);
        expect(tokens.tokens.get("github.com")).toBe("granted");
        expect(notifier.logs.some((entry) => entry.message.includes("granted"))).toBe(false);
    });

    it("declining rejects with the token-required wording and prompts once", async () => {
        const { session, tokenPrompt, notifier } = sessionOver();

        await expect(session.run(GITHUB_MARKETPLACE, fakeFetch(nobody).task)).rejects.toThrow(
            errorWithMessage(/requires a personal access token/),
        );
        expect(tokenPrompt.prompts).toHaveLength(1);
        expect(notifier.logged("debug")).toContain("Token prompt for github.com declined");
    });

    it.each([
        { answered: "an empty answer", answer: "" },
        { answered: "a blank answer", answer: " \t " },
    ])(
        "takes $answered from the host for no token: stores and sends nothing",
        async ({ answer }) => {
            const { session, tokens, notifier } = sessionOver({
                tokenAnswers: { "github.com": answer },
            });
            const privateRepo = fakeFetch(nobody);

            await expect(session.run(GITHUB_MARKETPLACE, privateRepo.task)).rejects.toThrow(
                errorWithMessage(/requires a personal access token/),
            );
            expect(privateRepo.attempts).toEqual([undefined]);
            expect(tokens.tokens).toEqual(new Map());
            expect(notifier.logged("debug")).toContain("Token prompt for github.com declined");
        },
    );

    it("stores and sends a token without the whitespace the host's answer carried", async () => {
        const { session, tokens } = sessionOver({ tokenAnswers: { "github.com": "  granted\n" } });
        const privateRepo = fakeFetch(only("granted"));

        await expect(session.run(GITHUB_MARKETPLACE, privateRepo.task)).resolves.toBe("served");

        expect(privateRepo.attempts).toEqual([undefined, "granted"]);
        expect(tokens.tokens.get("github.com")).toBe("granted");
    });

    it.each<{
        rung: string;
        storedTokens: Record<string, string>;
        tokenAnswers: Record<string, string>;
        script: Error[];
        denial: RepositoryAccessError;
    }>([
        {
            rung: "the prompt is declined",
            storedTokens: {},
            tokenAnswers: {},
            script: [PRIVATE_REPO_404],
            denial: PRIVATE_REPO_404,
        },
        {
            rung: "the prompt is declined after the stored token was rejected",
            storedTokens: { "github.com": "old" },
            tokenAnswers: {},
            script: [PRIVATE_REPO_404, TOKEN_REJECTED_401],
            denial: TOKEN_REJECTED_401,
        },
        {
            rung: "the freshly entered token is denied too",
            storedTokens: {},
            tokenAnswers: { "github.com": "still-wrong" },
            script: [PRIVATE_REPO_404, TOKEN_REJECTED_401],
            denial: TOKEN_REJECTED_401,
        },
    ])(
        "keeps the last denial as the cause of the rewritten failure when $rung",
        async ({ storedTokens, tokenAnswers, script, denial }) => {
            const { session } = sessionOver({ storedTokens, tokenAnswers });

            const failure = await rejectionOf(
                session.run(GITHUB_MARKETPLACE, scriptedFetch(...script).task),
            );

            expect(failure.cause).toBe(denial);
        },
    );

    it("keeps the denial as the cause when an earlier decline suppresses the prompt", async () => {
        const { session } = sessionOver();
        await expect(session.run(GITHUB_SOURCE_ONE, fakeFetch(nobody).task)).rejects.toThrow();

        const failure = await rejectionOf(
            session.run(GITHUB_SOURCE_TWO, fakeFetch(nobody, OUTSIDE_GRANT_403).task),
        );

        expect(failure.cause).toBe(OUTSIDE_GRANT_403);
    });

    it("reports 'can't access' without the token when the freshly entered token is also denied", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "still-wrong" },
        });

        const failure = session.run(GITHUB_MARKETPLACE, fakeFetch(nobody).task);

        await expect(failure).rejects.toThrow(errorWithMessage(/can't access/));
        await expect(failure).rejects.not.toThrow(/still-wrong/);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("re-prompts with 'was rejected' wording for a stale stored token and overwrites it", async () => {
        const { session, tokenPrompt, tokens } = sessionOver({
            tokenAnswers: { "github.com": "new" },
            storedTokens: { "github.com": "old" },
        });

        await session.run(GITHUB_MARKETPLACE, fakeFetch(only("new")).task);

        expect(tokenPrompt.prompts).toContainEqual(expectedPromptFor("github.com", /was rejected/));
        expect(tokens.tokens.get("github.com")).toBe("new");
    });

    it("retries a session-cached token's public repo anonymously, never prompting", async () => {
        // A fine-grained token: it reads the private marketplace, but GitHub
        // answers 403 for a public repo outside its grant.
        const { session, tokenPrompt, tokens } = sessionOver({
            tokenAnswers: { "github.com": "should-not-be-used" },
            storedTokens: { "github.com": "stored-tok" },
        });
        await session.run(GITHUB_MARKETPLACE, fakeFetch(only("stored-tok")).task);
        const publicRepo = fakeFetch(
            anonymousOnly,
            new RepositoryAccessError("github.com", 403, "acme/pub", false),
        );

        await expect(session.run(GITHUB_SOURCE_ONE, publicRepo.task)).resolves.toBe("served");

        expect(publicRepo.attempts).toEqual(["stored-tok", undefined]);
        expect(tokenPrompt.prompts).toEqual([]);
        expect(tokens.tokens).toEqual(new Map([["github.com", "stored-tok"]]));
    });

    it("prompts with 'was rejected' wording when a session-cached token and the anonymous retry are both denied", async () => {
        const { session, tokenPrompt, tokens } = sessionOver({
            tokenAnswers: { "github.com": "new" },
            storedTokens: { "github.com": "stored-tok" },
        });
        await session.run(GITHUB_MARKETPLACE, fakeFetch(only("stored-tok")).task);
        const otherPrivateRepo = fakeFetch(only("new"), OUTSIDE_GRANT_403);

        await expect(session.run(GITHUB_SOURCE_ONE, otherPrivateRepo.task)).resolves.toBe("served");

        expect(otherPrivateRepo.attempts).toEqual(["stored-tok", undefined, "new"]);
        expect(tokenPrompt.prompts).toEqual([expectedPromptFor("github.com", /was rejected/)]);
        expect(tokens.reads).toEqual(["github.com"]);
    });

    it("attempts in order anonymous → stored → new when a stale token guards a private repo", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "new" },
            storedTokens: { "github.com": "old" },
        });
        const privateRepo = fakeFetch(only("new"));

        await session.run(GITHUB_MARKETPLACE, privateRepo.task);

        expect(privateRepo.attempts).toEqual([undefined, "old", "new"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("prompts from the stored-token denial, not the anonymous one, when the stored token is rejected", async () => {
        const { session, tokenPrompt } = sessionOver({
            storedTokens: { "github.com": "old" },
        });
        const storedTokenDenied = new RepositoryAccessError(
            "github.com",
            401,
            "acme/templates",
            false,
        );

        await expect(
            session.run(
                GITHUB_MARKETPLACE,
                scriptedFetch(PRIVATE_REPO_404, storedTokenDenied).task,
            ),
        ).rejects.toThrow(errorWithMessage(/can't access acme\/templates \(HTTP 401\)/));
        expect(tokenPrompt.prompts).toEqual([
            expectedPromptFor("github.com", /was rejected \(HTTP 401\)/),
        ]);
    });

    it("skips the anonymous retry when a session-cached token hits the rate limit", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "new" },
            storedTokens: { "github.com": "stored-tok" },
        });
        await session.run(GITHUB_MARKETPLACE, fakeFetch(only("stored-tok")).task);
        const rateLimited = fakeFetch(
            only("new"),
            new RepositoryAccessError("github.com", 403, "acme/one", true),
        );

        await expect(session.run(GITHUB_SOURCE_ONE, rateLimited.task)).resolves.toBe("served");

        expect(rateLimited.attempts).toEqual(["stored-tok", "new"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("a rate-limited anonymous 403 retries with the stored token before prompting", async () => {
        // The anonymous fallback for a rejected token is skipped: it would only
        // hit the lower limit again.
        const { session, tokenPrompt } = sessionOver({
            storedTokens: { "github.com": "have-it" },
        });
        const rateLimited = fakeFetch(
            nobody,
            new RepositoryAccessError("github.com", 403, "acme/templates", true),
        );

        await expect(session.run(GITHUB_MARKETPLACE, rateLimited.task)).rejects.toThrow(
            errorWithMessage(/rate limit/i),
        );
        expect(rateLimited.attempts).toEqual([undefined, "have-it"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("makes exactly one pre-prompt attempt when no token is stored", async () => {
        const { session, tokenPrompt, tokens } = sessionOver();
        const privateRepo = fakeFetch(nobody);

        await expect(session.run(GITHUB_MARKETPLACE, privateRepo.task)).rejects.toThrow();

        expect(privateRepo.attempts).toEqual([undefined]);
        // The store is read once, lazily, after the anonymous 404 — and finds nothing.
        expect(tokens.reads).toEqual(["github.com"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("mentions the rate limit (not a rejection) when a 403 rate-limit persists with a token", async () => {
        const { session } = sessionOver({ storedTokens: { "github.com": "have-it" } });

        const failure = session.run(
            GITHUB_MARKETPLACE,
            fakeFetch(nobody, new RepositoryAccessError("github.com", 403, "acme/templates", true))
                .task,
        );

        await expect(failure).rejects.toThrow(errorWithMessage(/rate limit/i));
        await expect(failure).rejects.not.toThrow(/can't access/);
    });

    it("derives the rate-limit warning wording from the failing host (gitlab 429)", async () => {
        const { session } = sessionOver({ storedTokens: { "gitlab.com": "have-it" } });

        await expect(
            session.run(
                GITLAB_PROJECT,
                fakeFetch(nobody, new RepositoryAccessError("gitlab.com", 429, "group/proj", true))
                    .task,
            ),
        ).rejects.toThrow(errorWithMessage(/gitlab\.com rate limit exceeded/));
    });

    // A public marketplace must not raise the macOS keychain popup, which happens
    // when a fetch eagerly reads the PasswordSafe-backed token store.
    it("never consults the token store or prompt for a public marketplace", async () => {
        const { session, tokens, tokenPrompt } = sessionOver();
        const publicRepos = fakeFetch(anyone);

        await session.run(GITHUB_MARKETPLACE, publicRepos.task);
        await session.run(GITHUB_SOURCE_ONE, publicRepos.task);

        expect(tokens.reads).toEqual([]);
        expect(tokenPrompt.prompts).toEqual([]);
        // No config ever carried a token value (anonymous throughout).
        const carriedToken = publicRepos.attempts.some((token) => token !== undefined);
        expect(carriedToken).toBe(false);
    });

    it("reads the store at most once per host per run after repeated auth failures", async () => {
        // Two sources that 404 anonymously and with any token; the prompt
        // declines. The store must be read exactly once.
        const { session, tokens, tokenPrompt } = sessionOver();

        await expect(session.run(GITHUB_SOURCE_ONE, fakeFetch(nobody).task)).rejects.toThrow();
        await expect(session.run(GITHUB_SOURCE_TWO, fakeFetch(nobody).task)).rejects.toThrow();

        expect(tokens.reads).toEqual(["github.com"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("session-caches a prompted token and reuses it for later sources without re-reading the store", async () => {
        const { session, tokens, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "granted" },
        });
        const sourceOne = fakeFetch(only("granted"));
        const sourceTwo = fakeFetch(only("granted"));

        await session.run(GITHUB_MARKETPLACE, fakeFetch(only("granted")).task);
        await session.run(GITHUB_SOURCE_ONE, sourceOne.task);
        await session.run(GITHUB_SOURCE_TWO, sourceTwo.task);

        expect(tokens.reads).toEqual(["github.com"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
        expect(sourceOne.attempts).toEqual(["granted"]);
        expect(sourceTwo.attempts).toEqual(["granted"]);
    });

    it("never sends one host's token to a different host in the same session", async () => {
        const { session } = sessionOver({ tokenAnswers: { "gitlab.acme.com": "gl-tok" } });
        const githubRepo = fakeFetch(anyone);

        await session.run(
            SELF_HOSTED_GITLAB_PROJECT,
            fakeFetch(
                only("gl-tok"),
                new RepositoryAccessError("gitlab.acme.com", 404, "group/proj", false),
            ).task,
        );
        await session.run(GITHUB_MARKETPLACE, githubRepo.task);

        expect(githubRepo.attempts).toEqual([undefined]);
    });
});

describe("HostTokenSession.ensureTokensForPrivateHosts", () => {
    it("prompts once per declared-private host with an empty store, also across calls", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "granted" },
        });

        await session.ensureTokensForPrivateHosts(["github.com"]);
        await session.ensureTokensForPrivateHosts(["github.com"]);

        expect(tokenPrompt.prompts).toEqual([
            expectedPromptFor("github.com", /hosts a private template source/),
        ]);
    });

    it("does not prompt when a token for the host is already stored, and carries it first try", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "granted" },
            storedTokens: { "github.com": "have-it" },
        });
        const privateRepo = fakeFetch(only("have-it"));

        await session.ensureTokensForPrivateHosts(["github.com"]);
        await session.run(GITHUB_SOURCE_ONE, privateRepo.task);

        expect(tokenPrompt.prompts).toEqual([]);
        expect(privateRepo.attempts).toEqual(["have-it"]);
    });

    it("still re-prompts a host whose stored token skipped the pre-prompt but is then rejected", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "github.com": "new" },
            storedTokens: { "github.com": "stale" },
        });
        const privateRepo = fakeFetch(only("new"));

        await session.ensureTokensForPrivateHosts(["github.com"]);
        await expect(session.run(GITHUB_SOURCE_ONE, privateRepo.task)).resolves.toBe("served");

        expect(privateRepo.attempts).toEqual(["stale", undefined, "new"]);
        expect(tokenPrompt.prompts).toEqual([expectedPromptFor("github.com", /was rejected/)]);
    });

    it("keys a self-hosted gitlab host's token so its baseUrl config carries it", async () => {
        const { session, tokenPrompt } = sessionOver({
            tokenAnswers: { "gitlab.acme.com": "granted" },
        });
        const privateProject = fakeFetch(only("granted"));

        await session.ensureTokensForPrivateHosts(["gitlab.acme.com"]);
        await session.run(SELF_HOSTED_GITLAB_PROJECT, privateProject.task);

        expect(tokenPrompt.prompts).toEqual([
            expectedPromptFor("gitlab.acme.com", /hosts a private template source/),
        ]);
        expect(privateProject.attempts).toEqual(["granted"]);
    });

    it("does not prompt again for a host the session already prompted and declined", async () => {
        const { session, tokens, tokenPrompt } = sessionOver();

        await expect(session.run(GITHUB_MARKETPLACE, fakeFetch(nobody).task)).rejects.toThrow();
        await session.ensureTokensForPrivateHosts(["github.com"]);

        expect(tokens.reads).toEqual(["github.com"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });

    it("remembers a declined pre-prompt, so a later denial on the host does not prompt again", async () => {
        const { session, tokens, tokenPrompt } = sessionOver();

        await session.ensureTokensForPrivateHosts(["github.com"]);

        await expect(session.run(GITHUB_SOURCE_ONE, fakeFetch(nobody).task)).rejects.toThrow(
            errorWithMessage(/requires a personal access token/),
        );
        expect(tokens.reads).toEqual(["github.com"]);
        expect(tokenPrompt.prompts).toHaveLength(1);
    });
});
