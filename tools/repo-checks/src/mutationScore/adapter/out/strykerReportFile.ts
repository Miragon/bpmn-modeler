import { existsSync, readFileSync } from "node:fs";

import type { StrykerReports } from "../../port/StrykerReports";

export class StrykerReportFile implements StrykerReports {
    read(path: string): unknown {
        if (!existsSync(path)) {
            return undefined;
        }
        try {
            return JSON.parse(readFileSync(path, "utf8"));
        } catch (error) {
            throw new Error(`the Stryker report ${path} is no JSON: ${(error as Error).message}`, {
                cause: error,
            });
        }
    }
}
