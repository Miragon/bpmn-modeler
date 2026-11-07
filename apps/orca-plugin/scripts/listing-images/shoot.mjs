// Runs inside the Orca smoke container (see render.mjs): a fresh Orca with a throwaway profile opens
// the demo folder and saves bpmn-editor.png (the editor alone), bpmn-window.png and dmn-window.png
// (the whole Orca window) into the results directory.
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const here = dirname(fileURLToPath(import.meta.url));
const plugin = resolve(here, "../../plugin");
const results = resolve(here, "../../test-results/orca-smoke/listing-images");
mkdirSync(results, { recursive: true });

const app = process.env.ORCA_APP;
const cli = join(app, "resources", "bin", "orca-ide");
const profile = mkdtempSync(join(tmpdir(), "orca-listing-"));
const demo = "/workspace/order-service";
cpSync(join(here, "demo"), demo, { recursive: true });
const bpmn = join(demo, "order-fulfilment.bpmn");
const dmn = join(demo, "shipping.dmn");

const env = {
    ...process.env,
    HOME: profile,
    XDG_CONFIG_HOME: join(profile, "config"),
    XDG_CACHE_HOME: join(profile, "cache"),
    ORCA_BACKGROUND_LAUNCH: "1",
    CI: "1",
};
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const orca = (args) => {
    const run = spawnSync(cli, [...args, "--json"], { encoding: "utf8", env, timeout: 120_000 });
    try {
        return JSON.parse(run.stdout);
    } catch {
        return { ok: false, error: { message: `${run.stdout}${run.stderr}` } };
    }
};
const orcaOrFail = (args) => {
    const result = orca(args);
    if (result.ok === false) throw new Error(`orca ${args.join(" ")}: ${result.error?.message}`);
    return result;
};

const launch = async () => {
    const child = spawn(join(app, "AppRun"), ["--no-sandbox", "--password-store=basic"], {
        env,
        detached: true,
        stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr = `${stderr}${chunk}`.slice(-3000)));
    for (const started = Date.now(); ; await sleep(1000)) {
        const runtime = orca(["status"]).result?.runtime;
        if (runtime?.reachable && runtime.state === "ready") return child;
        if (Date.now() - started > 90_000) throw new Error(`Orca did not start: ${stderr}`);
    }
};
const stop = async (child) => {
    for (const signal of ["SIGTERM", "SIGKILL"]) {
        try {
            process.kill(-child.pid, signal);
        } catch {
            // the process group is gone already
        }
        await sleep(signal === "SIGTERM" ? 5000 : 2000);
    }
};

// Orca shows its onboarding, feature tips and tours to a fresh profile, over the editor. They are
// marked done in its profile database, whose rows carry a SHA-256 of their payload and must not
// be newer than the profile's revision.
const FEATURE_TIPS = [
    "chat-ui-here",
    "agent-session-search",
    "orca-cli",
    "cmd-j-palette",
    "voice-dictation",
];
const CONTEXTUAL_TOURS = [
    "workspace-board",
    "workspace-agent-sessions",
    "browser",
    "client-hosted-browser",
    "tasks",
    "automations",
    "floating-workspace",
    "workspace-creation",
    "projects-collapse-all",
];
const skipIntroductions = () => {
    const db = new DatabaseSync(
        join(profile, "config", "orca", "profiles", "local-default", "profile-state.db"),
    );
    const revision = Number(
        db.prepare("SELECT value FROM profile_state_meta WHERE key = 'revision'").get().value,
    );
    const stored = (domain) => {
        const row = db
            .prepare("SELECT payload FROM profile_state_documents WHERE domain = ?")
            .get(domain);
        return row ? JSON.parse(row.payload) : {};
    };
    const write = (domain, document) => {
        const payload = JSON.stringify(document);
        const hash = createHash("sha256").update(payload).digest("hex");
        db.prepare(
            `INSERT INTO profile_state_documents (domain, payload, domain_version, revision, updated_at, content_hash)
             VALUES (?, ?, 1, ?, ?, ?)
             ON CONFLICT(domain) DO UPDATE SET payload = excluded.payload, revision = excluded.revision,
               updated_at = excluded.updated_at, content_hash = excluded.content_hash`,
        ).run(domain, payload, revision, Date.now(), hash);
    };
    write("onboarding", {
        ...stored("onboarding"),
        flowVersion: 4,
        closedAt: Date.now(),
        outcome: "completed",
        lastCompletedStep: 5,
    });
    const ui = stored("ui");
    for (const key of Object.keys(ui)) if (key.endsWith("Dismissed")) ui[key] = true;
    write("ui", {
        ...ui,
        pluginsAlphaNoticeDismissed: true,
        featureTipsSeenIds: FEATURE_TIPS,
        contextualToursSeenIds: CONTEXTUAL_TOURS,
    });
    db.close();
};

let orcaProcess = await launch();
try {
    orcaOrFail(["repo", "add", "--path", demo, "--kind", "folder"]);
    await sleep(8000);
    await stop(orcaProcess);
    skipIntroductions();
    orcaProcess = await launch();
    await sleep(10_000);

    const fingerprint = orca(["plugin", "dev", "load", plugin]).error?.data?.approvalFingerprint;
    orcaOrFail([
        "plugin",
        "dev",
        "load",
        plugin,
        ...(fingerprint ? ["--approve", fingerprint] : []),
    ]);
    const key = "local.bpmn-modeler";
    const shot = (...args) => orcaOrFail(["plugin", "shot", key, "--theme", "light", ...args]);

    orcaOrFail(["plugin", "open", key, "--editor", bpmn]);
    orcaOrFail(["plugin", "open", key, "--editor", dmn]);
    await sleep(8000);

    shot(
        "--editor",
        bpmn,
        "--width",
        "1280",
        "--height",
        "800",
        "--out",
        join(results, "bpmn-editor.png"),
    );
    // Opens the decision table through its drill-down icon in the DRD, which dmn-js draws at the
    // diagram's own coordinates.
    shot(
        "--editor",
        dmn,
        "--act",
        JSON.stringify([{ click: [264, 113] }]),
        "--in-place",
        "--out",
        join(results, "dmn-act.png"),
    );
    await sleep(3000);
    shot("--window", "--out", join(results, "dmn-window.png"));
    orcaOrFail(["plugin", "open", key, "--editor", bpmn]);
    await sleep(3000);
    shot("--window", "--out", join(results, "bpmn-window.png"));
    console.log(`[listing-images] shots in ${results}`);
} finally {
    await stop(orcaProcess);
}
