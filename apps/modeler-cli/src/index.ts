#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import * as path from "path";

import { openBrowser } from "./launcher";
import { startServer } from "./server";

interface CliOptions {
    port?: number;
    open: boolean;
}

const program = new Command();

program
    .name("bpmn-modeler")
    .description("Open a BPMN or DMN file in a local browser modeler.")
    .argument("<file>", "Path to a .bpmn or .dmn file")
    .option(
        "-p, --port <number>",
        "Port to bind (default: auto-select a free port)",
        (raw) => Number.parseInt(raw, 10),
    )
    .option("--no-open", "Do not launch a browser window automatically")
    .version("0.0.1")
    .action(async (file: string, options: CliOptions) => {
        const absolute = path.resolve(process.cwd(), file);
        if (!fs.existsSync(absolute)) {
            console.error(`File not found: ${absolute}`);
            process.exit(1);
        }

        const ext = path.extname(absolute).toLowerCase();
        const kind = ext === ".bpmn" ? "bpmn" : ext === ".dmn" ? "dmn" : undefined;
        if (!kind) {
            console.error(`Unsupported file type: ${ext}. Expected .bpmn or .dmn.`);
            process.exit(1);
        }

        const { url } = await startServer({
            filePath: absolute,
            kind,
            port: options.port,
        });

        console.log(`BPMN/DMN modeler ready at ${url}`);
        console.log("Editing will save back to the source file.");
        console.log("Press Ctrl+C to stop.");

        if (options.open) {
            await openBrowser(url);
        }
    });

program.parseAsync(process.argv).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
