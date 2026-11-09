/**
 * Smoke test of the bpmnlint rule package gate under Bun, the runtime the
 * IntelliJ bridge ships in. Vitest runs the same flow under Node only, so this
 * pins what Node cannot: the gate needs no loader hook in Bun, and evicting
 * `require.cache` there makes a package allowed again run its new bytes.
 *
 * It drives the real bridge over a temp workspace whose `.bpmnlintrc` extends
 * `plugin:acme/recommended`, playing the host through the RPC frames, so the
 * linter runs with the bridge's `NodeInstalledPackages`: not allowed, the rule
 * does not run; allowed, it runs; its dependency edited, it stops; allowed
 * again, the edited bytes run. Exits non-zero on the first failed step.
 *
 * Run from the repository root (not part of `test`):
 *   corepack yarn workspace @miragon/bpmn-modeler-bridge smoke:rule-package-gate
 * or `bun run scripts/rule-package-gate-smoke.ts` inside apps/modeler-bridge.
 */

import {
    ACME_RULE,
    AcmeBridge,
    acmeRuns,
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

const EDITED = "v2, edited after the approval";

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

async function allowEveryPending(bridge: AcmeBridge, fromIndex: number): Promise<Frame> {
    const notice = await waitForNotice(bridge, fromIndex);
    const relintFrom = bridge.frames.length;
    const { change } = await reviewAndAllowAll(bridge, notice);
    check(
        change.allow.some(
            ({ pluginId, contentHash }) =>
                pluginId === bridge.acmeDir && contentHash.startsWith("bpmnlint-closure-v1:"),
        ),
        "the change allows a bpmnlint-closure-v1 row for the package",
        change,
    );
    return nextLintResults(bridge, relintFrom);
}

async function smoke(bridge: AcmeBridge): Promise<void> {
    const blocked = await lintOnHost(bridge);
    check(!ranRule(blocked), "a package nobody allowed reports no finding", findingsOf(blocked));
    check((await acmeRuns(bridge.root)).length === 0, "its rule never ran", []);
    check(
        warned(bridge, 0, `rule package ${bridge.acmeDir} is not allowed yet (new)`),
        "the bridge logs it as not allowed yet",
        bridge.acmeDir,
    );

    const allowed = await allowEveryPending(bridge, 0);
    check(ranRule(allowed), "the allowed package reports its finding", findingsOf(allowed));
    const afterAllow = await acmeRuns(bridge.root);
    check(afterAllow.join() === "v1", "the allowed bytes ran", afterAllow);

    await writeAcmeDependency(bridge.root, EDITED);
    const changedFrom = bridge.frames.length;
    const changed = await relint(bridge);
    check(!ranRule(changed), "an edited dependency stops the package", findingsOf(changed));
    check(
        warned(bridge, changedFrom, "(changed since you allowed it)"),
        "the bridge logs it as changed",
        bridge.acmeDir,
    );

    const reallowed = await allowEveryPending(bridge, changedFrom);
    const runs = await acmeRuns(bridge.root);
    check(
        findingsOf(reallowed)[ACME_RULE]?.some(
            (finding) => (finding as { message?: string }).message === EDITED,
        ) === true && runs.join("|") === `v1|${EDITED}`,
        "allowed again, the edited bytes run",
        { findings: findingsOf(reallowed), runs },
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
