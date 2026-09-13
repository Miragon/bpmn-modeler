import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import test from "node:test";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const dependencyOf = (parent, name) =>
    createRequire(require.resolve(`${parent}/package.json`))(name);
const tar = dependencyOf("app-builder-lib", "tar");
const extensionArchive = Buffer.from(
    "UEsDBBQAAAAIABuvLV0FyOCPPQAAAEEAAAAWAAAAZXh0ZW5zaW9uL3BhY2thZ2UuanNvbqtWKihNyskszkgtUrJSSsusKCktSlXSUcpLzE0FChQnpqXqplaUpOYVZ+bnAcXLUovALCslQz0DPQOlWgBQSwECFAMUAAAACAAbry1dBcjgjz0AAABBAAAAFgAAAAAAAAAAAAAAgAEAAAAAZXh0ZW5zaW9uL3BhY2thZ2UuanNvblBLBQYAAAAAAQABAEQAAABxAAAAAAA=",
    "base64",
);

async function temporaryDirectory(t) {
    const directory = await mkdtemp(path.join(tmpdir(), "modeler-security-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    return directory;
}

function archive(entries) {
    const blocks = [];
    for (const { data = Buffer.alloc(0), ...entry } of entries) {
        const header = new tar.Header({ mode: 0o644, type: "File", ...entry, size: data.length });
        header.encode();
        blocks.push(header.block, data, Buffer.alloc((512 - (data.length % 512)) % 512));
    }
    return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

test("shell quoting rejects injected operator tokens and preserves ordinary arguments", () => {
    const { quote, parse } = dependencyOf("npm-run-all", "shell-quote");
    assert.throws(() => quote([{ op: ";\necho injected" }]), TypeError);
    const argumentsToQuote = ["build:libs", "a b", "a'b", "a;b"];
    assert.deepEqual(parse(quote(argumentsToQuote)), argumentsToQuote);
});

for (const parent of ["node-gyp", "app-builder-lib"]) {
    test(`${parent} extracts files and streams with strip and filter options`, async (t) => {
        const directory = await temporaryDirectory(t);
        const extractor = dependencyOf(parent, "tar");
        const source = path.join(directory, "headers.tar.gz");
        await writeFile(
            source,
            gzipSync(
                archive([
                    { path: "node/include/node.h", data: Buffer.from("header") },
                    { path: "node/ignored.txt", data: Buffer.from("skip") },
                ]),
            ),
        );
        for (const mode of ["file", "stream"]) {
            const destination = path.join(directory, mode);
            await mkdir(destination);
            const options = { cwd: destination, strip: 1, filter: (name) => name.endsWith(".h") };
            if (mode === "file") {
                await extractor.extract({ ...options, file: source });
            } else {
                await pipeline(createReadStream(source), extractor.extract(options));
            }
            assert.equal(
                await readFile(path.join(destination, "include/node.h"), "utf8"),
                "header",
            );
            await assert.rejects(stat(path.join(destination, "ignored.txt")), { code: "ENOENT" });
        }
    });

    test(`${parent} rejects excessive decompression ratios`, async (t) => {
        const directory = await temporaryDirectory(t);
        const source = path.join(directory, "compressed.tar.gz");
        const destination = path.join(directory, "out");
        await mkdir(destination);
        await writeFile(
            source,
            gzipSync(archive([{ path: "zeros", data: Buffer.alloc(8 * 1024 * 1024) }])),
        );
        await assert.rejects(
            dependencyOf(parent, "tar").extract({ cwd: destination, file: source }),
            /max decompression ratio exceeded/,
        );
    });
}

for (const parent of ["@theia/cli", "@theia/plugin-ext", "@theia/plugin-ext-vscode"]) {
    test(`${parent} reads and extracts VSIX archives through CommonJS`, async (t) => {
        const directory = await temporaryDirectory(t);
        const decompress = dependencyOf(parent, "decompress");
        const files = await decompress(extensionArchive, {
            filter: (file) => file.path === "extension/package.json",
        });
        assert.equal(JSON.parse(files[0].data.toString()).name, "safe-extension");
        await decompress(extensionArchive, directory);
        assert.equal(
            JSON.parse(await readFile(path.join(directory, "extension/package.json"), "utf8")).name,
            "safe-extension",
        );
    });

    for (const type of ["SymbolicLink", "Link"]) {
        test(`${parent} rejects ${type} targets outside the output directory`, async (t) => {
            const directory = await temporaryDirectory(t);
            const outside = path.join(directory, "out-sibling");
            await writeFile(outside, "unchanged");
            const input = archive([{ path: "escape", type, linkpath: "../out-sibling" }]);
            await assert.rejects(
                dependencyOf(parent, "decompress")(input, path.join(directory, "out")),
                /outside/,
            );
            assert.equal(await readFile(outside, "utf8"), "unchanged");
        });
    }
}

test("Theia plugin deployment and extension identity use the replacement extractor", async (t) => {
    const directory = await temporaryDirectory(t);
    const source = path.join(directory, "extension.vsix");
    await writeFile(source, extensionArchive);
    const {
        extractExtensionIdentityFromVsix,
        decompressExtension,
    } = require("@theia/plugin-ext-vscode/lib/node/plugin-vscode-utils");
    const {
        PluginDeployerFileHandlerContextImpl,
    } = require("@theia/plugin-ext/lib/main/node/plugin-deployer-file-handler-context-impl");
    assert.deepEqual(await extractExtensionIdentityFromVsix(source), {
        publisher: "fixture",
        name: "safe-extension",
        version: "1.0.0",
    });
    await decompressExtension(source, path.join(directory, "vscode"));
    await new PluginDeployerFileHandlerContextImpl({}).unzip(source, path.join(directory, "theia"));
    for (const destination of ["vscode", "theia"]) {
        assert.equal(
            JSON.parse(
                await readFile(path.join(directory, destination, "extension/package.json"), "utf8"),
            ).name,
            "safe-extension",
        );
    }
});
