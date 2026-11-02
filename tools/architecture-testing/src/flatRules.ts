import type { ArchitectureRule } from "./architectureRule";
import { roleOf } from "./roleFolders";

/** A role folder outside a hexagonal workspace would read as a role no rule checks. */
export const FLAT_RULES: readonly ArchitectureRule[] = [
    {
        rule: "the workspace holds no role folder",
        violations: ({ files }) =>
            files.flatMap((path) => {
                const location = roleOf(path);
                return location === undefined ? [] : [{ from: path, to: `${location.role}/` }];
            }),
    },
];
