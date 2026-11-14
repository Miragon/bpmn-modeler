import { DirectoryNotFound, FileNotFound } from "../../kernel/domain/errors";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { LoggerPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { AddOnReadme, NO_README, ReadmePlace, readmeFileNameIn, readmeOf } from "../domain/addOnReadme";
import { README_UNREADABLE_TEXT } from "../domain/addOnTexts";

/** Reads the README a detail shows, at the place the catalog recorded for it. */
export class AddOnReadmeReader {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly logger: LoggerPort,
    ) {}

    async read(place: ReadmePlace | undefined): Promise<AddOnReadme> {
        if (place === undefined) return NO_README;
        try {
            const path = await this.pathOf(place);
            return path === undefined ? NO_README : readmeOf(await this.workspace.readFile(path));
        } catch (error) {
            if (error instanceof FileNotFound || error instanceof DirectoryNotFound) {
                return NO_README;
            }
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return { kind: "unreadable", text: README_UNREADABLE_TEXT };
        }
    }

    private async pathOf(place: ReadmePlace): Promise<string | undefined> {
        if (place.kind === "file") return place.path;
        const name = readmeFileNameIn(await this.workspace.readDirectory(place.dir));
        return name === undefined ? undefined : joinWorkspacePath(place.dir, name);
    }
}
