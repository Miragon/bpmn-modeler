import { DirectoryNotFound, FileNotFound } from "../../kernel/domain/errors";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";
import { LoggerPort, WorkspacePort } from "../../kernel/port/hostPorts";
import {
    AboutPlace,
    AddOnAbout,
    LicenseView,
    NO_ABOUT,
    packageLicenseViewOf,
    repositoryAboutOf,
} from "../domain/addOnAbout";
import { AddOnReadme, NO_README, readmeFileNameIn, readmeOf } from "../domain/addOnReadme";
import { README_UNREADABLE_TEXT } from "../domain/addOnTexts";

/** Reads what a detail shows below the core's facts, at the place the catalog recorded for it. */
export class AddOnAboutReader {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly logger: LoggerPort,
    ) {}

    async read(place: AboutPlace | undefined): Promise<AddOnAbout> {
        if (place === undefined) return NO_ABOUT;
        if (place.kind === "marketplace") {
            return {
                readme: await this.readmeAt(place.readmeFile),
                ...repositoryAboutOf(place.repository),
            };
        }
        const entries = await this.entriesOf(place.dir);
        const readmeName = readmeFileNameIn(entries);
        const license = entries.some(([name, kind]) => name === "package.json" && kind === "file")
            ? await this.packageLicenseOf(joinWorkspacePath(place.dir, "package.json"))
            : undefined;
        return {
            readme: await this.readmeAt(
                readmeName === undefined ? undefined : joinWorkspacePath(place.dir, readmeName),
            ),
            ...(license !== undefined && { license }),
        };
    }

    private async entriesOf(dir: string) {
        try {
            return await this.workspace.readDirectory(dir);
        } catch (error) {
            if (!(error instanceof DirectoryNotFound)) this.logError(error);
            return [];
        }
    }

    private async readmeAt(path: string | undefined): Promise<AddOnReadme> {
        if (path === undefined) return NO_README;
        try {
            return readmeOf(await this.workspace.readFile(path));
        } catch (error) {
            if (error instanceof FileNotFound) return NO_README;
            this.logError(error);
            return { kind: "unreadable", text: README_UNREADABLE_TEXT };
        }
    }

    /** A license only adds to a detail, so an unreadable manifest shows none. */
    private async packageLicenseOf(path: string): Promise<LicenseView | undefined> {
        try {
            return packageLicenseViewOf(await this.workspace.readFile(path));
        } catch (error) {
            if (!(error instanceof FileNotFound)) this.logError(error);
            return undefined;
        }
    }

    private logError(error: unknown): void {
        this.logger.logError(error instanceof Error ? error : new Error(String(error)));
    }
}
