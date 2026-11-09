import {
    FolderTemplateFileListing,
    TemplateFileListing,
    TemplateFileReading,
} from "../../../kernel/domain/templateListing";
import { ArtifactService } from "../../../kernel/service/ArtifactService";
import {
    configFolderOfTemplatesDir,
    templateFileReadingOf,
    templatesDirOf,
} from "../domain/elementTemplates";
import { BpmnElementTemplatesService } from "./BpmnElementTemplatesService";

/**
 * The element templates as the add-on catalog lists them: per file, read by
 * the loader's rule, from the folders the template service knows.
 */
export class TemplateInventory {
    constructor(
        private readonly templates: Pick<
            BpmnElementTemplatesService,
            "knownTemplateDirs" | "onDidChangeTemplateDirs"
        >,
        private readonly artifacts: Pick<ArtifactService, "readDirectory" | "readFile">,
    ) {}

    knownTemplateDirs(): readonly string[] {
        return this.templates.knownTemplateDirs();
    }

    templatesDirOf(dir: string, configFolder: string): string {
        return templatesDirOf(dir, configFolder);
    }

    async templatesIn(
        templatesDirs: readonly string[],
    ): Promise<readonly FolderTemplateFileListing[]> {
        const listed: FolderTemplateFileListing[] = [];
        for (const templatesDir of new Set(templatesDirs)) {
            const sourceDir = configFolderOfTemplatesDir(templatesDir);
            const files = await this.artifacts.readDirectory(templatesDir, ".json");
            for (const listing of await this.templatesOf(files)) {
                listed.push({ ...listing, sourceDir });
            }
        }
        return listed;
    }

    templatesOf(files: readonly string[]): Promise<readonly TemplateFileListing[]> {
        return Promise.all(
            files.map(async (path) => ({ path, reading: await this.readingOf(path) })),
        );
    }

    onDidChange(listener: () => void): { dispose(): void } {
        return this.templates.onDidChangeTemplateDirs(listener);
    }

    private async readingOf(path: string): Promise<TemplateFileReading> {
        try {
            return templateFileReadingOf(await this.artifacts.readFile(path));
        } catch (error) {
            return { kind: "unreadable", reason: (error as Error).message };
        }
    }
}
