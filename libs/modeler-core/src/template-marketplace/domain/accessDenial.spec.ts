import { describe, expect, it } from "vitest";

import { AccessDenial } from "./accessDenial";
import { RepositoryAccessError } from "./ports";

describe("AccessDenial", () => {
    it.each<{
        behaviour: string;
        error: RepositoryAccessError;
        tokenTried: boolean;
        promptReason: string;
        failureMessage: string;
    }>([
        {
            behaviour: "suspects a private repository when an anonymous request is denied",
            error: new RepositoryAccessError("github.com", 404, "acme/templates", false),
            tokenTried: false,
            promptReason:
                "github.com denied access to acme/templates (HTTP 404); it may be private. Enter a personal access token.",
            failureMessage:
                "acme/templates on github.com requires a personal access token (none provided).",
        },
        {
            behaviour: "blames the token when a request carrying one is denied",
            error: new RepositoryAccessError("gitlab.acme.com", 401, "group/project", false),
            tokenTried: true,
            promptReason:
                "The stored token for gitlab.acme.com was rejected (HTTP 401) for group/project. Enter a new token.",
            failureMessage: "The token for gitlab.acme.com can't access group/project (HTTP 401).",
        },
        {
            behaviour: "offers a token to lift the rate limit of an anonymous request",
            error: new RepositoryAccessError("gitlab.com", 429, "group/project", true),
            tokenTried: false,
            promptReason:
                "Hit gitlab.com's rate limit for group/project. A personal access token raises the limit.",
            failureMessage:
                "gitlab.com rate limit exceeded for group/project — try again later or provide a personal access token.",
        },
        {
            behaviour: "asks for a new token yet reports a rate limit hit with a token",
            error: new RepositoryAccessError("github.com", 403, "acme/templates", true),
            tokenTried: true,
            promptReason:
                "The stored token for github.com was rejected (HTTP 403) for acme/templates. Enter a new token.",
            failureMessage:
                "github.com rate limit exceeded for acme/templates — try again later or provide a personal access token.",
        },
    ])("$behaviour", ({ error, tokenTried, promptReason, failureMessage }) => {
        const denial = AccessDenial.of(error, { tokenTried });

        expect(denial.promptReason()).toBe(promptReason);
        expect(denial.failureMessage()).toBe(failureMessage);
    });
});
