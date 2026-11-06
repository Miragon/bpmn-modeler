import {
    describeMarketplacePromptContract,
    MarketplacePromptReply,
    ShownMarketplaceQuestion,
} from "@miragon/bpmn-modeler-core/testing";

import { METHODS } from "../../../protocol/domain/descriptor";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { RpcMarketplacePrompt } from "./RpcMarketplacePrompt";

/** `MarketplaceAddQuestion`, as `MarketplaceRouter.readQuestion` reads it from the params. */
interface AddQuestion {
    readonly title: string;
    readonly prompt: string;
    readonly placeholder: string;
    readonly location: string;
    readonly invalidLocation: string | undefined;
    readonly scopes: readonly { scope: string; label: string; description: string }[];
    readonly scope: string;
}

/** `JsonRpcParams.string`: an absent or null value fails the request. */
function requiredString(params: Readonly<Record<string, unknown>>, key: string): string {
    const value = params[key];
    if (value === undefined || value === null) {
        throw new Error(`Param '${key}' is missing or not of the expected type`);
    }
    return String(value);
}

function readQuestion(params: Readonly<Record<string, unknown>>): AddQuestion {
    if (!Array.isArray(params.scopes)) {
        throw new Error("Param 'scopes' is missing or not of the expected type");
    }
    const invalidLocation = params.invalidLocation;
    return {
        title: requiredString(params, "title"),
        prompt: requiredString(params, "prompt"),
        placeholder: requiredString(params, "placeholder"),
        location: requiredString(params, "location"),
        invalidLocation:
            invalidLocation === undefined || invalidLocation === null
                ? undefined
                : String(invalidLocation),
        scopes: params.scopes.map((choice: Record<string, unknown>) => ({
            scope: requiredString(choice, "scope"),
            label: requiredString(choice, "label"),
            description: requiredString(choice, "description"),
        })),
        scope: requiredString(params, "scope"),
    };
}

/**
 * `AddMarketplaceDialog` with the user's reply: the form starts from the
 * question's location and scope, a radio button per offered scope sets the
 * scope, OK answers the form as entered and Cancel answers `null`.
 */
function answerAsTheDialog(
    question: AddQuestion,
    reply: MarketplacePromptReply,
): { readonly location: string; readonly scope: string } | null {
    if ("dismisses" in reply) return null;
    if (reply.picks === undefined) return { location: reply.enters, scope: question.scope };
    const radio = question.scopes.find(({ scope }) => scope === reply.picks);
    if (!radio) throw new Error(`The form shows no radio button for "${reply.picks}".`);
    return { location: reply.enters, scope: radio.scope };
}

/** `RpcChannel.reply` and `replyError`: a handler that throws still answers its request. */
function replyTo(id: number, answer: () => unknown): string {
    try {
        return JSON.stringify({ id, result: answer() ?? null });
    } catch (error) {
        return JSON.stringify({ id, error: (error as Error).message });
    }
}

describeMarketplacePromptContract(
    "RpcMarketplacePrompt answered as the IntelliJ host answers",
    async () => {
        const replies: MarketplacePromptReply[] = [];
        const repliedTo: (() => void)[] = [];
        let shown: AddQuestion | undefined;
        const rpc: Rpc = new Rpc((line) => {
            const { id, method, params } = JSON.parse(line) as {
                id: number;
                method: string;
                params: Record<string, unknown>;
            };
            const reply = replyTo(id, () => {
                if (method !== METHODS.marketplacePromptShow) {
                    throw new Error(`The loopback answers only the add form, not ${method}`);
                }
                shown = readQuestion(params);
                const user = replies.shift();
                if (!user) throw new Error("No reply is scripted for the add form.");
                return answerAsTheDialog(shown, user);
            });
            // `MarketplaceRouter.handleAddForm` answers from the EDT, after the frame is read.
            queueMicrotask(() => {
                void rpc.handleLine(reply);
                repliedTo.shift()?.();
            });
        });
        return {
            prompt: new RpcMarketplacePrompt(rpc),
            replyToNext: (_question, reply) =>
                new Promise<void>((done) => {
                    replies.push(reply);
                    repliedTo.push(done);
                }),
            shown: (): ShownMarketplaceQuestion => {
                if (!shown) throw new Error("The host was asked nothing.");
                return {
                    title: shown.title,
                    prompt: shown.prompt,
                    placeholder: shown.placeholder,
                    location: shown.location,
                    refusal: shown.invalidLocation,
                    scopes: shown.scopes.map(({ label, description }) => ({ label, description })),
                };
            },
        };
    },
);
