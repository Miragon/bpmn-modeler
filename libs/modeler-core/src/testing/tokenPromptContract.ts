import { beforeEach, describe, expect, it } from "vitest";

import { TokenPrompt, tokenPromptFor } from "../template-marketplace/domain/tokenPrompt";
import { TokenPromptPort } from "../template-marketplace/port/marketplacePorts";

/**
 * One {@link TokenPromptPort} adapter under the {@link describeTokenPromptContract}
 * scenarios, with the user who answers it. Each answer is given before the
 * prompt is asked and answers the next input the host shows.
 */
export interface TokenPromptContractFixture {
    readonly tokenPrompt: TokenPromptPort;
    /** The user types `text` into the input shown for `prompt` and accepts it. */
    userTypes(prompt: TokenPrompt, text: string): void;
    /** The user closes the input shown for `prompt` without accepting: Escape or a click away. */
    userDismisses(prompt: TokenPrompt): void;
}

const GITHUB = tokenPromptFor("github.com", "declaredPrivate");
const GITLAB = tokenPromptFor("git.acme.io:8443", "declaredPrivate");

/**
 * The rules of {@link TokenPromptPort} the core relies on, run against one
 * adapter: the answer comes back as typed, blank or padded, because the core
 * judges it (`enteredToken`) and no host trims; a dismissal is `undefined`,
 * never a rejection, so a run that asks for several hosts goes on after one;
 * and each prompt gets the answer typed into it.
 *
 * Left out:
 * - What a host shows: the masked input, the title and prompt text, and VS
 *   Code's `ignoreFocusOut`. The core builds the words; each adapter's own spec
 *   pins that it shows them.
 * - A host that cannot ask, such as a disposed IntelliJ project, which answers
 *   as a dismissal: that is the Kotlin half of the bridge.
 */
export function describeTokenPromptContract(
    adapter: string,
    createFixture: () => Promise<TokenPromptContractFixture>,
): void {
    describe(`${adapter} keeps the TokenPromptPort contract`, () => {
        let fixture: TokenPromptContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it.each([
            { behaviour: "returns the token as typed", typed: "ghp_token" },
            { behaviour: "keeps the spaces around a token", typed: "  ghp_token \t" },
            { behaviour: "returns an empty answer as empty, not as a dismissal", typed: "" },
        ])("$behaviour", async ({ typed }) => {
            fixture.userTypes(GITHUB, typed);

            await expect(fixture.tokenPrompt.promptForToken(GITHUB)).resolves.toBe(typed);
        });

        it("resolves undefined when the user dismisses the input", async () => {
            fixture.userDismisses(GITHUB);

            await expect(fixture.tokenPrompt.promptForToken(GITHUB)).resolves.toBeUndefined();
        });

        it("answers each prompt of a run with what was typed into it", async () => {
            fixture.userDismisses(GITHUB);
            fixture.userTypes(GITLAB, "glpat_token");

            await expect(fixture.tokenPrompt.promptForToken(GITHUB)).resolves.toBeUndefined();
            await expect(fixture.tokenPrompt.promptForToken(GITLAB)).resolves.toBe("glpat_token");
        });
    });
}
