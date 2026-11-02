import { ChoicePrompt, ConfirmRequest, PickerPort, SearchPrompt } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { ConfirmShowParams, ConfirmShowResult, PickerShowParams, PickerShowResult } from "../../../protocol/domain/types";

/**
 * Real {@link PickerPort} over RPC: the host shows a native `JBPopup` list and
 * replies with the chosen indices (or `null` on dismissal); this class maps them
 * back to the prompt's values. The core builds every prompt, so the host carries
 * no per-prompt logic.
 */
export class RpcPicker implements PickerPort {
    constructor(private readonly rpc: Rpc) {}

    /** Round-trips one popup; returns the chosen indices or `null` on cancel. */
    private async show(opts: PickerShowParams): Promise<number[] | null> {
        const result = (await this.rpc.request(
            METHODS.pickerShow,
            opts,
        )) as PickerShowResult | null;
        return result?.selected ?? null;
    }

    async choose<V>(prompt: ChoicePrompt<V>): Promise<V | undefined> {
        const [index] = (await this.show(pickerShowParams(prompt, false))) ?? [];
        return index === undefined ? undefined : valueAt(prompt, index);
    }

    async chooseMany<V>(prompt: ChoicePrompt<V>): Promise<readonly V[]> {
        const selected = await this.show(pickerShowParams(prompt, true));
        return selected?.map((index) => valueAt(prompt, index)) ?? [];
    }

    /** A cancelled round trip resolves to `false`: silence is never consent. */
    async confirm(request: ConfirmRequest): Promise<boolean> {
        const result = (await this.rpc.request(METHODS.confirmShow, {
            title: request.title,
            confirmLabel: request.confirmLabel,
            details: [...request.details],
        } satisfies ConfirmShowParams)) as ConfirmShowResult | null;
        return result?.confirmed === true;
    }

    async searchAndChoose<R>(search: SearchPrompt<R>): Promise<{ outcome: R; chosen?: string }> {
        // The host can't render a busy list, so the search keeps its status-bar spinner.
        const title = search.searchingPlaceholder;
        this.rpc.notify(METHODS.notifierProgressStart, { title });
        let outcome: R;
        try {
            outcome = await search.search();
        } finally {
            this.rpc.notify(METHODS.notifierProgressEnd, { title });
        }

        const choices = search.choices(outcome);
        return { outcome, chosen: choices && (await this.choose(choices)) };
    }
}

function pickerShowParams<V>(prompt: ChoicePrompt<V>, canPickMany: boolean): PickerShowParams {
    return {
        title: prompt.title,
        placeholder: prompt.placeholder,
        canPickMany,
        items: prompt.items.map((item) => ({
            label: item.label,
            description: item.path ?? item.description,
        })),
    };
}

function valueAt<V>(prompt: ChoicePrompt<V>, index: number): V {
    const item = prompt.items[index];
    if (!item) {
        throw new Error(`picker/show chose index ${index} of prompt "${prompt.id}"`);
    }
    return item.value;
}
