import type { MissedPartnerReplay } from "../../domain/missedPartnerReplay";
import { missedPartnerReplayTable } from "../../domain/missedPartnerReplayTable";

export interface MissedPartnerUseCases {
    replay(): MissedPartnerReplay;
}

export interface MissedPartnerCliOutput {
    out(text: string): void;
    error(text: string): void;
}

const MISSED_PARTNER_USAGE = "usage: fitness missed-partner replay";

const EXIT_OK = 0;
const EXIT_BROKEN_INPUT = 1;
const EXIT_USAGE = 2;

export function runMissedPartnerCli(
    args: readonly string[],
    useCases: MissedPartnerUseCases,
    output: MissedPartnerCliOutput,
): number {
    if (args.length !== 1 || args[0] !== "replay") {
        const problem = args.length === 0 ? "needs replay" : `unexpected argument ${args.at(-1)}`;
        output.error(`fitness missed-partner: ${problem}\n${MISSED_PARTNER_USAGE}\n`);
        return EXIT_USAGE;
    }
    try {
        output.out(missedPartnerReplayTable(useCases.replay()));
        return EXIT_OK;
    } catch (error) {
        output.error(`fitness missed-partner: ${(error as Error).message}\n`);
        return EXIT_BROKEN_INPUT;
    }
}
