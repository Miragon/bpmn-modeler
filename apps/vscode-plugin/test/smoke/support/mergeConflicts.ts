import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { gitOutcome, runGit } from "./git";

export type GitOperation = "merge" | "rebase" | "cherry-pick" | "stash";

/** Each operation conflicts its own file in its own repository, so their Source Control rows tell them apart. */
export const CONFLICTED: Record<GitOperation, string> = {
    "merge": "merged.bpmn",
    "rebase": "rebased.bpmn",
    "cherry-pick": "picked.bpmn",
    "stash": "stashed.bpmn",
};

/** In the merge, main deleted the task with both of its flows while feature renamed it. */
export const REMOVAL_FILE = "removed.bpmn";
/** In the merge, both sides added this file, so a row that is no BPMN file is unmerged too. */
export const NOTES_FILE = "notes.txt";

export const repositoryFolder = (operation: GitOperation) => `${operation}-repo`;

/** A conflicted file as Git left it: its working file with the conflict markers and its index stages. */
export interface ConflictAsGitLeftIt {
    workingFile: string;
    stages: string;
}

export function unmergedStages(repository: string): Promise<string> {
    return runGit(repository, "ls-files", "-u");
}

function withoutCheckTask(processXml: string): string {
    return processXml
        .replace(/\s*<bpmn:task id="Task_Check"[\s\S]*?<\/bpmn:task>/, "")
        .replace(/\s*<bpmn:outgoing>Flow_To_Task<\/bpmn:outgoing>/, "")
        .replace(/\s*<bpmn:incoming>Flow_To_End<\/bpmn:incoming>/, "")
        .replace(/\s*<bpmn:sequenceFlow id="Flow_To_(Task|End)"[^>]*\/>/g, "")
        .replace(/\s*<bpmndi:BPMNShape id="Task_Check_di"[\s\S]*?<\/bpmndi:BPMNShape>/, "")
        .replace(/\s*<bpmndi:BPMNEdge id="Flow_To_(Task|End)_di"[\s\S]*?<\/bpmndi:BPMNEdge>/g, "");
}

/**
 * A repository whose one file conflicts after `operation`: both sides rename
 * the task. In the merge, feature alone also renames the end event, which the
 * merge takes from feature without asking, a second file conflicts on a task
 * main deleted and feature renamed, and both sides add a text file.
 */
async function conflictedRepository(
    workspace: string,
    operation: GitOperation,
    processXml: string,
): Promise<string> {
    const repository = join(workspace, repositoryFolder(operation));
    const file = join(repository, CONFLICTED[operation]);
    const removalFile = join(repository, REMOVAL_FILE);
    const notesFile = join(repository, NOTES_FILE);
    const isMerge = operation === "merge";
    const renamed = (name: string) => processXml.replace('name="Check order"', `name="${name}"`);
    const commitAll = (message: string) =>
        runGit(repository, "commit", "-q", "-a", "--no-verify", "-m", message);

    await mkdir(repository, { recursive: true });
    await runGit(repository, "init", "-q");
    await writeFile(file, processXml);
    await runGit(repository, "add", CONFLICTED[operation]);
    if (isMerge) {
        await writeFile(removalFile, processXml);
        await runGit(repository, "add", REMOVAL_FILE);
    }
    await runGit(repository, "commit", "-q", "--no-verify", "-m", "Add the order process");

    if (operation === "stash") {
        await writeFile(file, renamed("Check stashed order"));
        await runGit(repository, "stash", "push", "-q");
        await writeFile(file, renamed("Check main order"));
        await commitAll("Rename the check on main");
        await gitOutcome(repository, "stash", "pop");
        return repository;
    }

    await runGit(repository, "checkout", "-q", "-b", "feature");
    const featureVersion = renamed("Check feature order");
    await writeFile(
        file,
        isMerge
            ? featureVersion.replace('name="Order checked"', 'name="Order verified"')
            : featureVersion,
    );
    if (isMerge) {
        await writeFile(removalFile, featureVersion);
        await writeFile(notesFile, "feature\n");
        await runGit(repository, "add", NOTES_FILE);
    }
    await commitAll("Rename the check on feature");

    await runGit(repository, "checkout", "-q", "main");
    await writeFile(file, renamed("Check main order"));
    if (isMerge) {
        await writeFile(removalFile, withoutCheckTask(processXml));
        await writeFile(notesFile, "main\n");
        await runGit(repository, "add", NOTES_FILE);
    }
    await commitAll("Rename the check on main");

    if (isMerge) await gitOutcome(repository, "merge", "feature", "--no-edit");
    if (operation === "cherry-pick") await gitOutcome(repository, "cherry-pick", "feature");
    if (operation === "rebase") {
        await runGit(repository, "checkout", "-q", "feature");
        await gitOutcome(repository, "rebase", "main");
    }
    return repository;
}

/**
 * A repository per Git operation in `workspace`, each stopped at a conflict
 * on the task of the process, and what Git left of each conflicted file.
 */
export async function conflictedRepositories(
    workspace: string,
    processXml: string,
): Promise<Record<GitOperation, ConflictAsGitLeftIt>> {
    const conflicts = {} as Record<GitOperation, ConflictAsGitLeftIt>;
    for (const operation of Object.keys(CONFLICTED) as GitOperation[]) {
        const repository = await conflictedRepository(workspace, operation, processXml);
        const stages = await unmergedStages(repository);
        if (!stages.includes(CONFLICTED[operation])) {
            throw new Error(`the ${operation} left no conflict on ${CONFLICTED[operation]}`);
        }
        conflicts[operation] = {
            workingFile: await readFile(join(repository, CONFLICTED[operation]), "utf8"),
            stages,
        };
    }
    return conflicts;
}
