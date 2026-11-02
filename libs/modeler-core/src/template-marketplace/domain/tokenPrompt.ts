import { AccessDenial } from "./accessDenial";

/** Why the session asks: a refused request, or a source the marketplace declares private. */
export type TokenPromptReason = AccessDenial | "declaredPrivate";

export function tokenPromptFor(host: string, reason: TokenPromptReason): TokenPrompt {
    const prompt =
        reason === "declaredPrivate"
            ? `${host} hosts a private template source. Enter a personal access token to fetch it.`
            : reason.promptReason();
    return { host, title: `Personal Access Token for ${host}`, prompt, password: true };
}

/** A blank answer is no token: stored, it would suppress every later prompt and authenticate nothing. */
export function enteredToken(answer: string | undefined): string | undefined {
    const token = answer?.trim();
    return token ? token : undefined;
}

/** A masked input the core builds in full; the host renders it and returns what was typed. */
export interface TokenPrompt {
    /**
     * The host the token is for: the session stores the answer under it and the
     * test kit answers by it; no host renders it.
     */
    readonly host: string;
    readonly title: string;
    readonly prompt: string;
    readonly password: true;
}
