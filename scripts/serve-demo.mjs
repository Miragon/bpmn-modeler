#!/usr/bin/env node
// Dependency-free static server for the built demo (dist/demo).
// Used by `yarn demo` / the Conductor run target.
import { createReadStream, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..");
const webroot = resolve(repoRoot, "dist/demo");
const port = Number(process.env.PORT ?? 4321);
const host = process.env.HOST ?? "127.0.0.1";

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".wasm": "application/wasm",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".map": "application/json; charset=utf-8",
    ".bpmn": "application/xml; charset=utf-8",
    ".dmn": "application/xml; charset=utf-8",
    ".gz": "application/gzip",
};

function resolvePath(urlPath) {
    // Decode + strip the leading slash so it resolves *inside* the webroot;
    // `resolve` collapses any `..`, and the boundary check (with the trailing
    // separator) rejects anything that escapes — including sibling dirs like
    // `dist/demo-evil` that a bare `startsWith(webroot)` would let through.
    const decoded = decodeURIComponent(urlPath.split(/[?#]/)[0]).replace(/^\/+/, "");
    let filePath = resolve(webroot, decoded);
    if (filePath !== webroot && !filePath.startsWith(webroot + sep)) {
        return null;
    }
    try {
        if (statSync(filePath).isDirectory()) {
            filePath = join(filePath, "index.html");
        }
    } catch {
        // falls through to the 404 in the handler
    }
    return filePath;
}

const server = createServer((req, res) => {
    // Mirror netlify.toml's `/` redirect so the bare root lands on the BPMN
    // demo instead of 404-ing (there is no root index.html to serve).
    const rawPath = (req.url ?? "/").split(/[?#]/)[0];
    if (rawPath === "" || rawPath === "/") {
        res.writeHead(302, { location: "/bpmn/?model=newsletter" }).end();
        return;
    }
    const filePath = resolvePath(req.url ?? "/");
    if (!filePath) {
        res.writeHead(400).end("Bad request");
        return;
    }
    let stat;
    try {
        stat = statSync(filePath);
    } catch {
        res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
        return;
    }
    res.writeHead(200, {
        "content-type": MIME[extname(filePath)] ?? "application/octet-stream",
        "content-length": stat.size,
        "cache-control": "no-cache",
    });
    createReadStream(filePath).pipe(res);
});

try {
    statSync(join(webroot, "bpmn", "index.html"));
} catch {
    console.error(`No build found at ${webroot}. Run \`corepack yarn build:demo\` first.`);
    process.exit(1);
}

server.listen(port, host, () => {
    // Under portless the real (stable, worktree-scoped) URL is PORTLESS_URL;
    // fall back to the raw host:port when run directly (preview:demo).
    const base = process.env.PORTLESS_URL ?? `http://${host}:${port}`;
    console.log(`\n  Miragon Modeler demo → ${base}/`);
    console.log(`  BPMN: ${base}/bpmn/?model=newsletter`);
    console.log(`  DMN:  ${base}/dmn/?model=categorize-applicant\n`);
});
