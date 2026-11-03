import { parseFindings } from "../domain/finding";
import {
    type FitnessFunction,
    InsufficientHistory,
    type MeasurementContext,
} from "../domain/fitnessFunction";
import type { Measurement } from "../domain/snapshot";

export function measure(
    fitnessFunction: FitnessFunction,
    context: MeasurementContext,
): Measurement {
    const source = `fitness function ${fitnessFunction.id} at ${context.commit}`;
    let output: unknown;
    try {
        output = fitnessFunction.findFindings(context);
    } catch (error) {
        if (error instanceof InsufficientHistory) {
            return { unmeasurable: error.message };
        }
        throw new Error(`${source} failed: ${(error as Error).message}`, { cause: error });
    }
    return {
        findings: parseFindings(source, output, fitnessFunction.groups?.map(({ id }) => id) ?? []),
    };
}
