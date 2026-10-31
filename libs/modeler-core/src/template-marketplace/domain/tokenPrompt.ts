/** A masked input the core builds in full; the host renders it and returns what was typed. */
export interface TokenPrompt {
    /** The host the token is for. The test kit answers by it; no host renders it. */
    readonly host: string;
    readonly title: string;
    readonly prompt: string;
    readonly password: true;
}

export function tokenPrompt(host: string, reason: string): TokenPrompt {
    return { host, title: `Personal Access Token for ${host}`, prompt: reason, password: true };
}

/** A blank answer is no token: stored, it would suppress every later prompt and authenticate nothing. */
export function enteredToken(answer: string | undefined): string | undefined {
    const token = answer?.trim();
    return token ? token : undefined;
}
