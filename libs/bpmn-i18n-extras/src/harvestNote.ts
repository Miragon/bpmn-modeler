import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Not `new URL(…, import.meta.url)`: under jsdom that URL is jsdom's, which fileURLToPath refuses.
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** The test that writes a record, as Vitest hands it to `it`: `async ({ task }) => …`. */
export interface RecordingTest {
    readonly file: { readonly filepath: string; readonly projectName: string | undefined };
}

/** The note of a record a spec writes, naming that spec and its rerecord command as Vitest runs them. */
export const harvestNote = (subject: string, recordingTest: RecordingTest): string => {
    const { filepath, projectName } = recordingTest.file;
    if (projectName === undefined) {
        throw new Error(
            `${filepath} has no Vitest project name to rerecord it with: give its vitest.config.ts a test.name.`,
        );
    }
    const specPath = relative(REPO_ROOT, filepath).split(sep).join("/");
    // `-u` takes an optional value: written before the path, it swallows it and updates the whole project.
    return `${subject}, recorded by ${specPath}. Refresh it with \`corepack yarn vitest run --project ${projectName} ${specPath} -u\`. Feeds the needed-key set alongside the browser harvests.`;
};
