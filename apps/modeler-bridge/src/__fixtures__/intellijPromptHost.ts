import { METHODS } from "../protocol/domain/descriptor";
import {
    ActionNoticeShowParams,
    ActionNoticeShowResult,
    ConfirmShowResult,
    PickerShowParams,
    PickerShowResult,
    TokenPromptShowParams,
    TokenPromptShowResult,
} from "../protocol/domain/types";
import { Rpc } from "../transport/adapter/out/Rpc";

/** What the user does with the next chooser, dialog, password prompt or notification IntelliJ shows. */
type IntellijPromptAnswer =
    | { readonly kind: "pick"; readonly row: number }
    | { readonly kind: "check"; readonly rows: readonly number[] }
    | { readonly kind: "dismiss" }
    | { readonly kind: "confirm" }
    | { readonly kind: "decline" }
    | { readonly kind: "type"; readonly text: string }
    | { readonly kind: "click"; readonly index: number }
    | { readonly kind: "close" };

export interface IntellijPromptHost {
    readonly rpc: Rpc;
    answerNext(answer: IntellijPromptAnswer): void;
    /** The labels of the rows the last `picker/show` listed, in the order `HostPicker` lists them. */
    shownLabels(): readonly string[];
    /** What the last `actionNotice/show` showed, as `HostUiRouter` reads it. */
    shownNotice(): ActionNoticeShowParams | undefined;
}

interface CoreFrame {
    readonly id?: number;
    readonly method: string;
    readonly params: Readonly<Record<string, unknown>>;
}

function wrongAnswer(method: string, answer: IntellijPromptAnswer): Error {
    return new Error(`The user cannot answer ${method} with "${answer.kind}"`);
}

/**
 * `HostUiRouter.handlePick` over `HostPicker`: a list popup reports the one
 * chosen row, a `PickManyDialog` its checked rows in list order, whatever order
 * they were checked in, and a dismissal `PickerShowResult(null)`, which Gson
 * writes as `{}`.
 */
function answerPick(params: PickerShowParams, answer: IntellijPromptAnswer): PickerShowResult {
    if (
        !Array.isArray(params.items) ||
        params.items.some((item) => typeof item.label !== "string")
    ) {
        throw new Error("Param 'items' is missing or not of the expected type");
    }
    const rows = params.items.map((_item, row) => row);
    const shown = (row: number) => {
        if (!rows.includes(row)) throw new Error(`picker/show shows no row ${row}`);
        return row;
    };
    if (answer.kind === "dismiss") return {};
    if (answer.kind === "pick" && !params.canPickMany) return { selected: [shown(answer.row)] };
    if (answer.kind === "check" && params.canPickMany) {
        answer.rows.forEach(shown);
        return { selected: rows.filter((row) => answer.rows.includes(row)) };
    }
    throw wrongAnswer(METHODS.pickerShow, answer);
}

/** `HostUiRouter.handleConfirm`: only the Yes button confirms; No and Escape do not. */
function answerConfirm(answer: IntellijPromptAnswer): ConfirmShowResult {
    if (answer.kind === "confirm") return { confirmed: true };
    if (answer.kind === "decline" || answer.kind === "dismiss") return { confirmed: false };
    throw wrongAnswer(METHODS.confirmShow, answer);
}

/**
 * `MarketplaceRouter.handleTokenPrompt`: the text as typed, or a null result on
 * cancel; `params.string` fails a missing title or prompt.
 */
function answerTokenPrompt(
    params: TokenPromptShowParams,
    answer: IntellijPromptAnswer,
): TokenPromptShowResult | null {
    for (const key of ["title", "prompt"] as const) {
        if (typeof params[key] !== "string") {
            throw new Error(`Param '${key}' is missing or not of the expected type`);
        }
    }
    if (answer.kind === "type") return { token: answer.text };
    if (answer.kind === "dismiss") return null;
    throw wrongAnswer(METHODS.tokenPromptShow, answer);
}

/**
 * `HostUiRouter`'s `actionNotice/show` over `HostNotifications.actionNotice`:
 * one action per label, a click answers its index, and an expired
 * notification `ActionNoticeShowResult(null)`, which Gson writes as `{}`.
 */
function answerNotice(
    params: ActionNoticeShowParams,
    answer: IntellijPromptAnswer,
): ActionNoticeShowResult {
    if (!Array.isArray(params.labels) || params.labels.some((label) => typeof label !== "string")) {
        throw new Error("Param 'labels' is missing or not of the expected type");
    }
    for (const key of ["tone", "message"] as const) {
        if (typeof params[key] !== "string") {
            throw new Error(`Param '${key}' is missing or not of the expected type`);
        }
    }
    if (answer.kind === "close") return {};
    if (answer.kind === "click") {
        if (!params.labels[answer.index]) {
            throw new Error(`actionNotice/show shows no action ${answer.index}`);
        }
        return { chosen: answer.index };
    }
    throw wrongAnswer(METHODS.actionNoticeShow, answer);
}

const SHOWN_WITHOUT_REPLY = new Set<string>([
    METHODS.notifierProgressStart,
    METHODS.notifierProgressEnd,
]);

/**
 * Answers `picker/show`, `confirm/show`, `tokenPrompt/show` and
 * `actionNotice/show` as the IntelliJ host's `HostUiRouter` and
 * `MarketplaceRouter` do, with the answers queued by
 * {@link IntellijPromptHost.answerNext} standing in for the user, one per
 * prompt in the order shown. It takes the progress notifications a search
 * sends and fails any other call. A reply leaves out a null result, as the
 * host's Gson does.
 */
export function intellijPromptHost(): IntellijPromptHost {
    const answers: IntellijPromptAnswer[] = [];
    const nextAnswer = (method: string) => {
        const answer = answers.shift();
        if (!answer) throw new Error(`No user answer queued for ${method}`);
        return answer;
    };
    let shownLabels: readonly string[] = [];
    let shownNotice: ActionNoticeShowParams | undefined;
    const handlers: Readonly<Record<string, (params: never) => unknown>> = {
        [METHODS.pickerShow]: (params: PickerShowParams) => {
            const result = answerPick(params, nextAnswer(METHODS.pickerShow));
            shownLabels = params.items.map((item) => item.label);
            return result;
        },
        [METHODS.confirmShow]: () => answerConfirm(nextAnswer(METHODS.confirmShow)),
        [METHODS.tokenPromptShow]: (params: TokenPromptShowParams) =>
            answerTokenPrompt(params, nextAnswer(METHODS.tokenPromptShow)),
        [METHODS.actionNoticeShow]: (params: ActionNoticeShowParams) => {
            const result = answerNotice(params, nextAnswer(METHODS.actionNoticeShow));
            shownNotice = { tone: params.tone, message: params.message, labels: params.labels };
            return result;
        },
    };

    const rpc: Rpc = new Rpc((line) => {
        const { id, method, params } = JSON.parse(line) as CoreFrame;
        if (id === undefined) {
            if (!SHOWN_WITHOUT_REPLY.has(method)) throw new Error(`Unexpected ${method}`);
            return;
        }
        let reply: string;
        try {
            const handler = handlers[method];
            if (!handler) throw new Error(`Unexpected ${method}`);
            const result = handler(params as never);
            reply = JSON.stringify(result === null ? { id } : { id, result });
        } catch (error) {
            reply = JSON.stringify({ id, error: (error as Error).message });
        }
        queueMicrotask(() => void rpc.handleLine(reply));
    });
    return {
        rpc,
        answerNext: (answer) => answers.push(answer),
        shownLabels: () => shownLabels,
        shownNotice: () => shownNotice,
    };
}
