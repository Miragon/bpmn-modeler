import { DirectoryNotFound, FileNotFound } from "../../kernel/domain/errors";
import { manifestPathOf, packageManifestOf } from "../../kernel/domain/packageManifest";
import { readmeFileNameIn } from "../../kernel/domain/readmeFile";
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
import { AddOnReadme, NO_README, readmeOf } from "../domain/addOnReadme";
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
        const readmeName = readmeFileNameIn(await this.fileNamesIn(place.dir));
        const license = await this.packageLicenseOf(place.dir);
        return {
            readme: await this.readmeAt(
                readmeName === undefined ? undefined : joinWorkspacePath(place.dir, readmeName),
            ),
            ...(license !== undefined && { license }),
        };
    }

    private async fileNamesIn(dir: string): Promise<string[]> {
        try {
            const entries = await this.workspace.readDirectory(dir);
            return entries.filter(([, kind]) => kind === "file").map(([name]) => name);
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
    private async packageLicenseOf(dir: string): Promise<LicenseView | undefined> {
        try {
            const license = packageManifestOf(
                await this.workspace.readFile(manifestPathOf(dir)),
            )?.license;
            return license === undefined ? undefined : packageLicenseViewOf(license);
        } catch (error) {
            if (!(error instanceof FileNotFound)) this.logError(error);
            return undefined;
        }
    }

    private logError(error: unknown): void {
        this.logger.logError(error instanceof Error ? error : new Error(String(error)));
    }
}
