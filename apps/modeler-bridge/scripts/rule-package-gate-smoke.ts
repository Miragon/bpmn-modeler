/**
 * Smoke test of the bpmnlint rule package gate under Bun, the runtime the
 * IntelliJ bridge ships in. Vitest runs the same flow under Node only, so this
 * pins what Node cannot: the gate needs no loader hook in Bun, and evicting
 * `require.cache` there makes an updated package run its new bytes, those of
 * its hoisted dependency included.
 *
 * It drives the real bridge over a temp workspace whose `.bpmnlintrc` extends
 * `plugin:acme/recommended`, playing the host through the RPC frames, so the
 * linter runs with the bridge's `NodeInstalledPackages`: not allowed, the rule
 * does not run; allowed, it runs; its dependency edited in place, the loaded
 * bytes keep running; its version bumped, the edited bytes run without a
 * question. Exits non-zero on the first failed step.
 *
 * Run from the repository root (not part of `test`):
 *   corepack yarn workspace @miragon/bpmn-modeler-bridge smoke:rule-package-gate
 * or `bun run scripts/rule-package-gate-smoke.ts` inside apps/modeler-bridge.
 */

import { allowanceKeyOf, allowanceOf, LOCAL_HOST } from "@miragon/bpmn-modeler-core";

import {
    ACME_RULE,
    AcmeBridge,
    acmeRuns,
    bumpAcmeVersion,
    createAcmeWorkspace,
    findingsOf,
    Frame,
    lintOnHost,
    nextLintResults,
    openAcmeBridge,
    relint,
    reviewAndAllowAll,
    waitForNotice,
    writeAcmeDependency,
} from "../src/__fixtures__/rulePackageBridge";
import { PluginApprovalsSnapshot } from "../src/protocol/domain/types";

const EDITED = "v2, edited after the allow";

class SmokeFailure extends Error {}

function check(passed: boolean, step: string, detail: unknown): void {
    if (!passed) {
        throw new SmokeFailure(`${step}: ${JSON.stringify(detail)}`);
    }
    console.log(`ok   ${step}`);
}

function warned(bridge: AcmeBridge, fromIndex: number, text: string): boolean {
    return bridge.frames
        .slice(fromIndex)
        .some(
            (frame) =>
                frame.method === "notifier/log" &&
                frame.params.level === "warn" &&
                String(frame.params.message).includes(text),
        );
}

const ranRule = (results: Frame) => ACME_RULE in findingsOf(results);

// The host's list across allows: the bridge ignores a reply no newer than the list it holds.
let stored: PluginApprovalsSnapshot = { approvals: [], revision: 1 };

async function allowEveryPending(bridge: AcmeBridge, fromIndex: number): Promise<Frame> {
    const notice = await waitForNotice(bridge, fromIndex);
    const relintFrom = bridge.frames.length;
    const answered = await reviewAndAllowAll(bridge, notice, stored);
    stored = answered.stored;
    const { change } = answered;
    const key = allowanceKeyOf(
        allowanceOf("rulePackage", bridge.acmeDir, { kind: "noRepository" }, LOCAL_HOST),
    );
    check(
        change.allow.length === 1 &&
            change.allow[0]?.contentHash === "allowance-v1:rulePackage" &&
            change.allow[0]?.pluginId === key,
        "the change holds exactly the package's allowance row",
        change,
    );
    return nextLintResults(bridge, relintFrom);
}

const noticesOf = (bridge: AcmeBridge) =>
    bridge.frames.filter((frame) => frame.method === "actionNotice/show" && frame.id !== undefined)
        .length;

const ranWith = (results: Frame, message: string) =>
    findingsOf(results)[ACME_RULE]?.some(
        (finding) => (finding as { message?: string }).message === message,
    ) === true;

async function smoke(bridge: AcmeBridge): Promise<void> {
    const blocked = await lintOnHost(bridge);
    check(!ranRule(blocked), "a package nobody allowed reports no finding", findingsOf(blocked));
    check((await acmeRuns(bridge.root)).length === 0, "its rule never ran", []);
    check(
        warned(
            bridge,
            0,
            `rule package bpmnlint-plugin-acme@1.0.0 (${bridge.acmeDir}) is not allowed yet (new)`,
        ),
        "the bridge logs it as not allowed yet",
        bridge.acmeDir,
    );

    const allowed = await allowEveryPending(bridge, 0);
    check(ranRule(allowed), "the allowed package reports its finding", findingsOf(allowed));
    const afterAllow = await acmeRuns(bridge.root);
    check(afterAllow.join() === "v1", "the allowed bytes ran", afterAllow);
    const notices = noticesOf(bridge);

    await writeAcmeDependency(bridge.root, EDITED);
    const edited = await relint(bridge);
    check(
        ranWith(edited, "v1") && noticesOf(bridge) === notices,
        "an edit that leaves package.json alone keeps the loaded bytes, without a notice",
        { findings: findingsOf(edited), notices: noticesOf(bridge) },
    );

    await bumpAcmeVersion(bridge.root, "1.0.1");
    const updated = await relint(bridge);
    const runs = await acmeRuns(bridge.root);
    check(
        ranWith(updated, EDITED) &&
            runs.join("|") === `v1|v1|${EDITED}` &&
            noticesOf(bridge) === notices,
        "an update runs the edited dependency bytes, without a notice",
        { findings: findingsOf(updated), runs, notices: noticesOf(bridge) },
    );
}

async function main(): Promise<number> {
    if (!("Bun" in globalThis)) {
        console.error("Run this with bun: it checks the gate under Bun, not Node.");
        return 2;
    }
    const bridge = await openAcmeBridge(await createAcmeWorkspace());
    try {
        await smoke(bridge);
        console.log("rule package gate smoke passed");
        return 0;
    } catch (error) {
        console.error(`FAIL ${error instanceof SmokeFailure ? error.message : String(error)}`);
        return 1;
    } finally {
        await bridge.dispose();
    }
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(error);
        process.exit(1);
    },
);
