import type { SourceFile } from "@miragon/architecture-testing";

const YARN_COMMAND = /^\s*(?:- )?run: (?:corepack )?yarn (.+?)\s*$/gm;
const FOCUS = /^workspaces focus (.+)$/;
const TRIGGER_PATH = /^ {6,}- (?:'([^']+)'|"([^"]+)"|([^\s'"#]\S*))\s*(?:#.*)?$/;
const BLOCK_RUN = /^(\s*)(?:- )?run: ([|>][-+]?)\s*$/;
const FOLDED_YARN_COMMAND = /^\s*((?:corepack )?yarn .*?)\s*$/;

interface Assignment {
    readonly value: string;
    readonly expands: boolean;
}

function readAssignment(workflow: SourceFile, variable: string): Assignment {
    const assignment = new RegExp(`^\\s*${variable}=(?:'([^']+)'|"([^"]+)")$`, "m").exec(
        workflow.text,
    );
    if (!assignment) {
        throw new Error(`${workflow.path} assigns no ${variable}`);
    }
    return assignment[1] === undefined
        ? { value: assignment[2], expands: true }
        : { value: assignment[1], expands: false };
}

/** A one-line `VARIABLE='…'` or `VARIABLE="…"` in a `run:` script. */
export function workflowAssignment(workflow: SourceFile, variable: string): string {
    return readAssignment(workflow, variable).value;
}

function expandedAssignment(workflow: SourceFile, variable: string): string {
    const { value, expands } = readAssignment(workflow, variable);
    return expands
        ? value.replace(/\$\{(\w+)\}/g, (_reference, referenced: string) =>
              expandedAssignment(workflow, referenced),
          )
        : value;
}

/** A double-quoted assignment expands each `${VARIABLE}`, as the workflow's shell does. */
export function workflowPattern(workflow: SourceFile, variable: string): RegExp {
    return new RegExp(expandedAssignment(workflow, variable));
}

function indentOf(line: string): number {
    return line.length - line.trimStart().length;
}

function isBlankOrComment(line: string): boolean {
    return line.trim() === "" || line.trimStart().startsWith("#");
}

function pathsLineIndex(lines: readonly string[], event: string): number {
    const eventLine = lines.indexOf(`  ${event}:`);
    for (let index = eventLine + 1; eventLine !== -1 && index < lines.length; index++) {
        if (lines[index] === "    paths:") {
            return index;
        }
        if (!isBlankOrComment(lines[index]) && indentOf(lines[index]) < 4) {
            break;
        }
    }
    return -1;
}

export function triggerPaths(workflow: SourceFile, event: "push" | "pull_request"): string[] {
    const lines = workflow.text.split("\n");
    const pathsLine = pathsLineIndex(lines, event);
    const paths: string[] = [];
    for (const line of pathsLine === -1 ? [] : lines.slice(pathsLine + 1)) {
        if (isBlankOrComment(line)) {
            continue;
        }
        if (indentOf(line) < 6) {
            break;
        }
        const entry = TRIGGER_PATH.exec(line);
        if (!entry) {
            throw new Error(`${workflow.path}: cannot read the ${event} path line \`${line}\``);
        }
        paths.push(entry[1] ?? entry[2] ?? entry[3]);
    }
    if (paths.length === 0) {
        throw new Error(`${workflow.path} has no ${event} paths`);
    }
    return paths;
}

// A yarn command inside a block scalar is invisible to the one-line reads below.
function rejectFoldedYarnCommands(workflow: SourceFile): void {
    const lines = workflow.text.split("\n");
    lines.forEach((line, index) => {
        const block = BLOCK_RUN.exec(line);
        if (!block) {
            return;
        }
        for (const bodyLine of lines.slice(index + 1)) {
            if (bodyLine.trim() !== "" && indentOf(bodyLine) <= block[1].length) {
                break;
            }
            const command = FOLDED_YARN_COMMAND.exec(bodyLine)?.[1];
            if (command !== undefined) {
                throw new Error(
                    `${workflow.path} runs \`${command}\` in a \`run: ${block[2]}\` block; give it a one-line \`run:\``,
                );
            }
        }
    });
}

function oneLineYarnCommands(workflow: SourceFile): string[] {
    rejectFoldedYarnCommands(workflow);
    return [...workflow.text.matchAll(YARN_COMMAND)].map(([, command]) => command);
}

export function focusedWorkspaces(workflow: SourceFile): string[] {
    const workspaces = oneLineYarnCommands(workflow).flatMap(
        (command) => FOCUS.exec(command)?.[1].split(/\s+/) ?? [],
    );
    if (workspaces.length === 0) {
        throw new Error(`${workflow.path} has no one-line \`run: yarn workspaces focus …\``);
    }
    return workspaces;
}

/** The arguments of each one-line `run: yarn …` step but the focused install. */
export function yarnRunSteps(workflow: SourceFile): string[] {
    const steps = oneLineYarnCommands(workflow).filter((command) => !FOCUS.test(command));
    if (steps.length === 0) {
        throw new Error(`${workflow.path} has no one-line \`run: yarn …\` step`);
    }
    return steps;
}

/** The ids in the job's `if:` that test `contains(fromJSON(…affected-targets), '<id>')`. */
export function jobConditionTargets(workflow: SourceFile, job: string): string[] {
    const jobBlock = new RegExp(`^ {2}${job}:\\n((?:(?: {4}.*)?\\n)*)`, "m").exec(
        workflow.text,
    )?.[1];
    const condition = jobBlock && /^ {4}if: (.*(?:\n {6}.*)*)/m.exec(jobBlock)?.[1];
    const targets = [
        ...(condition ?? "").matchAll(/contains\(fromJSON\([^)]*\), '([^']+)'\)/g),
    ].map(([, target]) => target);
    if (targets.length === 0) {
        throw new Error(`${workflow.path} job ${job} names no Vitest target in its if`);
    }
    return targets;
}
