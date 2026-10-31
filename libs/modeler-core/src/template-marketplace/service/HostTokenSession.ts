import { NotifierPort } from "../../kernel/domain/hostPorts";
import { AccessDenial } from "../domain/accessDenial";
import {
    hostForConfig,
    RepositoryAccessError,
    RepositorySourceConfig,
    TokenPrompt,
    TokenPromptPort,
    TokenStorePort,
} from "../domain/ports";
import { enteredToken, tokenPromptFor } from "../domain/tokenPrompt";

/**
 * The per-host personal access tokens of one user-initiated command. Within a
 * session the store is read and the user prompted at most once per host, and a
 * decline is remembered so the command does not nag. A command that spans
 * several marketplaces (an update) must share one session, or each marketplace
 * re-reads and re-prompts.
 *
 * The ladder is lazy — anonymous first, and {@link TokenStorePort} is read only
 * *after* an auth-shaped {@link RepositoryAccessError} — because a store read is
 * not free: on IntelliJ the port is PasswordSafe-backed and every read raises
 * the macOS confidential-information popup, so a public repository must never
 * touch the keychain. The token lives only in {@link TokenStorePort} and never
 * reaches logs or error messages; token lifecycle events (prompt, store,
 * decline) are logged by host name only. {@link hostForConfig} is the single
 * place a config maps to the host its token is keyed by, so github.com,
 * gitlab.com, and self-hosted `baseUrl` origins are handled the same way.
 */
export class HostTokenSession {
    private readonly promptedHosts = new Set<string>();
    /** host → token resolved this session; `undefined` = nothing stored, or declined. */
    private readonly hostTokens = new Map<string, string | undefined>();

    constructor(
        private readonly tokens: TokenStorePort,
        private readonly tokenPrompt: TokenPromptPort,
        private readonly notifier: NotifierPort,
    ) {}

    /**
     * Runs `task` down a lazy auth ladder: anonymous → stored (read on demand) →
     * prompt-and-retry. The first attempt is always anonymous (or a token already
     * resolved this session), so a public repository never touches
     * {@link tokens}. The keychain is consulted only *after* an auth-shaped
     * {@link RepositoryAccessError}, at most once per host per session (cached in
     * `hostTokens`, including a `undefined` miss).
     *
     * When a *session-cached* token is rejected and the failure isn't
     * rate-limited, it retries **without** the token first: a fine-grained PAT's
     * grant is scoped to specific repos and GitHub returns 403 for any repo
     * outside that grant — even a public one — so the anonymous retry lets such
     * a repo succeed without clobbering the working token stored for another
     * private repo on the same host.
     *
     * A non-auth error or an unauthenticated host (a local folder) propagates
     * unchanged. A rate-limited anonymous 403 escalates to the stored token
     * (higher limits) and, failing that, to the prompt. On decline or a final
     * denial the failure is rewritten via {@link accessFailure}, keeping the
     * denial as its `cause`; the raw text would say "HTTP 404" for a private repo.
     */
    async run<T>(
        baseConfig: RepositorySourceConfig,
        task: (config: RepositorySourceConfig) => Promise<T>,
    ): Promise<T> {
        const host = hostForConfig(baseConfig);
        // Never a store read: only a token already resolved this session (or none).
        const sessionToken = host === undefined ? undefined : this.hostTokens.get(host);
        try {
            return await task(withToken(baseConfig, sessionToken));
        } catch (error) {
            if (!(error instanceof RepositoryAccessError) || host === undefined) {
                throw error;
            }
            // Log the raw access failure before {@link accessFailure} rewrites it
            // to a friendly message: the status/resource is what a bug report needs.
            const rateNote = error.rateLimited ? ", rate limited" : "";
            this.notifier.logDebug(
                `${error.host} denied access to ${error.resource} (HTTP ${error.status}${rateNote})`,
            );
            let hadToken = sessionToken !== undefined;
            let denial = error;

            // (a) A session-cached (likely fine-grained) token was rejected for a
            // repo outside its grant. Try anonymously before prompting: a public
            // repo then just works and the stored token survives untouched.
            if (hadToken && !error.rateLimited) {
                this.notifier.logDebug(
                    `Retrying ${error.resource} on ${error.host} without the stored token`,
                );
                try {
                    return await task(withToken(baseConfig, undefined));
                } catch (anonError) {
                    if (anonError instanceof RepositoryAccessError) {
                        // Anonymous failed too, so the repo isn't public — fall
                        // through to the prompt using the *original* error, whose
                        // "was rejected … enter a new token" wording stays right.
                        this.notifier.logDebug(
                            `Anonymous retry failed: HTTP ${anonError.status} for ${anonError.resource}`,
                        );
                    } else {
                        throw anonError;
                    }
                }
            }

            // (b) Lazy store read: the keychain is touched only now, after an auth
            // failure. Also the rate-limit escalation path — a stored token
            // raises the anonymous limit.
            if (!hadToken) {
                const stored = await this.storedToken(host);
                if (stored !== undefined) {
                    this.notifier.logDebug(`Using stored token for ${host}`);
                    hadToken = true;
                    try {
                        return await task(withToken(baseConfig, stored));
                    } catch (storedError) {
                        if (!(storedError instanceof RepositoryAccessError)) {
                            throw storedError;
                        }
                        // Keep the "was rejected" wording pointing at the token attempt.
                        denial = storedError;
                        this.notifier.logDebug(
                            `Stored token rejected: HTTP ${storedError.status} for ${storedError.resource}`,
                        );
                    }
                }
            }

            // (c) Prompt once per session.
            if (!this.claimPrompt(host)) {
                this.notifier.logDebug(
                    `Token prompt for ${host} suppressed (already prompted this run)`,
                );
                throw this.accessFailure(denial, hadToken);
            }
            const fresh = await this.promptAndStore(
                tokenPromptFor(host, AccessDenial.of(denial, { tokenTried: hadToken })),
            );
            if (fresh === undefined) {
                throw this.accessFailure(denial, hadToken);
            }
            this.notifier.logDebug(
                `Retrying ${denial.resource} on ${denial.host} with the new token`,
            );
            try {
                return await task(withToken(baseConfig, fresh));
            } catch (retryError) {
                if (retryError instanceof RepositoryAccessError) {
                    this.notifier.logDebug(
                        `Retry with new token failed: HTTP ${retryError.status} for ${retryError.resource}`,
                    );
                    throw this.accessFailure(retryError, true);
                }
                throw retryError;
            }
        }
    }

    /**
     * Prompts up front for every host without a stored token, so {@link run}
     * picks the token up first try. Meant for the hosts a manifest *declares*
     * private: `visibility` is only a hint, so undeclared-private sources still
     * get the failure-driven prompt instead.
     *
     * A declared-private source is the one case that justifies a deliberate
     * up-front store read — the marketplace author told us the repo needs a
     * token. A resolved token seeds the session cache so the source's very
     * first fetch already carries it.
     */
    async ensureTokensForPrivateHosts(hosts: readonly string[]): Promise<void> {
        if (hosts.length > 0) {
            this.notifier.logDebug(`Declared-private source host(s): ${hosts.join(", ")}`);
        }
        for (const host of hosts) {
            if ((await this.storedToken(host)) === undefined && this.claimPrompt(host)) {
                await this.promptAndStore(tokenPromptFor(host, "declaredPrivate"));
            }
        }
    }

    /** Reads the keychain at most once per host per session; a miss is remembered too. */
    private async storedToken(host: string): Promise<string | undefined> {
        if (!this.hostTokens.has(host)) {
            this.hostTokens.set(host, await this.tokens.getToken(host));
        }
        return this.hostTokens.get(host);
    }

    /** `false` once this session prompted the host, whatever the answer, so a decline is remembered. */
    private claimPrompt(host: string): boolean {
        if (this.promptedHosts.has(host)) {
            return false;
        }
        this.promptedHosts.add(host);
        return true;
    }

    /**
     * The single prompt→store sequence, so the token lifecycle is logged in
     * exactly one place. A granted token is session-cached so later same-host
     * fetches carry it on their first attempt. Only the host name reaches the
     * log — never the token value.
     */
    private async promptAndStore(prompt: TokenPrompt): Promise<string | undefined> {
        const { host } = prompt;
        this.notifier.logDebug(`Prompting for a ${host} access token`);
        const token = enteredToken(await this.tokenPrompt.promptForToken(prompt));
        if (token !== undefined) {
            await this.tokens.setToken(host, token);
            this.hostTokens.set(host, token);
            this.notifier.logDebug(`Token for ${host} stored`);
        } else {
            this.notifier.logDebug(`Token prompt for ${host} declined`);
        }
        return token;
    }

    /** `ErrorOptions` is not in this lib target, so the cause is attached directly. */
    private accessFailure(error: RepositoryAccessError, tokenTried: boolean): Error {
        return Object.assign(new Error(AccessDenial.of(error, { tokenTried }).failureMessage()), {
            cause: error,
        });
    }
}

/** Places `token` onto a remote (github/gitlab) config; local configs never carry one. */
function withToken(
    config: RepositorySourceConfig,
    token: string | undefined,
): RepositorySourceConfig {
    return config.kind === "local" ? config : { ...config, token };
}
