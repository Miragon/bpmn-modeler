/** A masked input the core builds in full; the host renders it and returns what was typed. */
export interface TokenPrompt {
    /** The host the token is for. The test kit answers by it; no host renders it. */
    readonly host: string;
    readonly title: string;
    readonly prompt: string;
    readonly password: true;
}

export function tokenPrompt(host: string, _reason: string): TokenPrompt {
    return { host, title: "", prompt: "", password: true };
}

export function enteredToken(answer: string | undefined): string | undefined {
    return answer;
}
