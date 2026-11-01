import { AccessDenial } from "./accessDenial";
import { TokenPrompt } from "./ports";

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
