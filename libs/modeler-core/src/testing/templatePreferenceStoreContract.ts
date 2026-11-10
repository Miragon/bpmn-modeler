import { beforeEach, describe, expect, it } from "vitest";

import { ProjectScope } from "../kernel/domain/projectScopes";
import {
    templatePreferenceChange,
    TemplatePreferences,
    TemplatePreferencesByScope,
    TemplateSwitch,
} from "../kernel/domain/templatePreferences";
import { TemplatePreferenceStorePort } from "../kernel/port/templatePreferencePorts";

/** One {@link TemplatePreferenceStorePort} adapter under the {@link describeTemplatePreferenceStoreContract} scenarios. */
export interface TemplatePreferenceStoreContractFixture {
    /** Holds no switch yet. */
    readonly store: TemplatePreferenceStorePort;
    /**
     * Another writer stores `preferences` as the list of `scope`, as another
     * window or project does. With `notify` the store hears of it as the host
     * tells it (VS Code re-reads it when the window gains focus); without, it
     * does not.
     */
    storeElsewhere(
        scope: ProjectScope,
        preferences: TemplatePreferences,
        options?: { readonly notify?: boolean },
    ): Promise<void>;
}

const SHOP = "configFolder:shop/.camunda";
const ACME = "marketplace:github:github.com/acme/templates";
const SHOP_OFF: TemplateSwitch = { source: SHOP };
const MAIL_OFF: TemplateSwitch = { source: SHOP, templateId: "mail" };
const REST_OFF: TemplateSwitch = { source: ACME, templateId: 'rest#2@"v"' };
const ACME_OFF: TemplateSwitch = { source: ACME };

const disabling = (scope: ProjectScope, ...switches: TemplateSwitch[]) =>
    templatePreferenceChange(scope, switches, []);

const enabling = (scope: ProjectScope, ...switches: TemplateSwitch[]) =>
    templatePreferenceChange(scope, [], switches);

function stored(
    project: readonly TemplateSwitch[],
    allProjects: readonly TemplateSwitch[] = [],
): TemplatePreferencesByScope {
    return { project: { disabled: project }, allProjects: { disabled: allProjects } };
}

/**
 * The rules of {@link TemplatePreferenceStorePort} the core relies on, run
 * against one adapter. A store with no switches reads both scopes empty. A
 * change is merged into the list the host stores for its scope only, so a
 * switch the change does not name stays, also one another writer stored that
 * this store never read, and a read right after the change includes it. A
 * change that names a switch twice rejects and stores nothing. `readStored`
 * asks the host for both lists rather than a mirror, and `read` returns what
 * it answered from then on. `onDidChange` fires once whenever the store learns
 * of new switches in either scope, and never for the same switches.
 *
 * Left out: where an adapter keeps the lists. That no repository can write
 * them is the adapter's rule; VS Code keeps them in its workspace and global
 * state.
 */
export function describeTemplatePreferenceStoreContract(
    adapter: string,
    createFixture: () => Promise<TemplatePreferenceStoreContractFixture>,
): void {
    describe(`${adapter} keeps the TemplatePreferenceStorePort contract`, () => {
        let fixture: TemplatePreferenceStoreContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it("reads both scopes empty before the first change", () => {
            expect(fixture.store.read()).toEqual(stored([]));
        });

        it("reads a disabled switch back once the change resolved", async () => {
            await fixture.store.change(disabling("project", MAIL_OFF, SHOP_OFF));

            expect(fixture.store.read()).toEqual(stored([MAIL_OFF, SHOP_OFF]));
        });

        it.each<{ scope: ProjectScope; other: ProjectScope }>([
            { scope: "project", other: "allProjects" },
            { scope: "allProjects", other: "project" },
        ])("never touches $other with a change of $scope", async ({ scope, other }) => {
            await fixture.store.change(disabling(other, ACME_OFF));

            await fixture.store.change(disabling(scope, ACME_OFF, REST_OFF));
            await fixture.store.change(enabling(scope, ACME_OFF));

            expect(fixture.store.read()[other]).toEqual({ disabled: [ACME_OFF] });
            expect(fixture.store.read()[scope]).toEqual({ disabled: [REST_OFF] });
        });

        it("keeps a switch another writer stored that this store had not read", async () => {
            await fixture.store.change(disabling("project", MAIL_OFF));
            await fixture.storeElsewhere("project", { disabled: [MAIL_OFF, ACME_OFF] });

            await fixture.store.change(disabling("project", SHOP_OFF));

            expect(fixture.store.read().project).toEqual({
                disabled: [MAIL_OFF, ACME_OFF, SHOP_OFF],
            });
        });

        it("enables exactly the switch it names and keeps a source and its template apart", async () => {
            await fixture.store.change(disabling("project", SHOP_OFF, MAIL_OFF, REST_OFF));

            await fixture.store.change(enabling("project", SHOP_OFF));

            expect(fixture.store.read().project).toEqual({ disabled: [MAIL_OFF, REST_OFF] });
        });

        it("rejects a change that names a switch twice and stores nothing", async () => {
            await fixture.store.change(disabling("project", MAIL_OFF));

            await expect(
                fixture.store.change({
                    scope: "project",
                    disable: [SHOP_OFF],
                    enable: [SHOP_OFF],
                }),
            ).rejects.toThrow();
            await fixture.store.change(disabling("project", REST_OFF));

            expect(fixture.store.read().project).toEqual({ disabled: [MAIL_OFF, REST_OFF] });
        });

        it("keeps both switches of two changes started together", async () => {
            await Promise.all([
                fixture.store.change(disabling("allProjects", ACME_OFF)),
                fixture.store.change(disabling("allProjects", REST_OFF)),
            ]);

            expect(fixture.store.read().allProjects).toEqual({ disabled: [ACME_OFF, REST_OFF] });
        });

        it("reads the lists another writer stored once readStored answered them", async () => {
            await fixture.store.change(disabling("project", MAIL_OFF));
            await fixture.storeElsewhere("allProjects", { disabled: [ACME_OFF] });

            const answered = await fixture.store.readStored();

            expect(answered).toEqual(stored([MAIL_OFF], [ACME_OFF]));
            expect(fixture.store.read()).toEqual(stored([MAIL_OFF], [ACME_OFF]));
        });

        it("announces each change once and no change that keeps every switch", async () => {
            let announced = 0;
            fixture.store.onDidChange(() => announced++);

            await fixture.store.change(disabling("project", MAIL_OFF));
            await fixture.store.change(disabling("project", MAIL_OFF));
            await fixture.store.change(enabling("project", SHOP_OFF));
            await fixture.store.change(disabling("allProjects", MAIL_OFF));
            await fixture.store.change(enabling("project", MAIL_OFF));

            expect(announced).toBe(3);
        });

        it("announces switches another writer stored once the store hears of them", async () => {
            const announced: TemplatePreferencesByScope[] = [];
            fixture.store.onDidChange(() => announced.push(fixture.store.read()));

            await fixture.storeElsewhere("allProjects", { disabled: [ACME_OFF] }, { notify: true });

            expect(announced).toEqual([stored([], [ACME_OFF])]);
        });

        it("announces switches readStored found changed, and not the same ones again", async () => {
            await fixture.store.change(disabling("project", MAIL_OFF));
            let announced = 0;
            fixture.store.onDidChange(() => announced++);
            await fixture.storeElsewhere("project", { disabled: [MAIL_OFF, SHOP_OFF] });

            await fixture.store.readStored();
            await fixture.store.readStored();

            expect(announced).toBe(1);
        });

        it("announces nothing to a listener it disposed", async () => {
            let announced = 0;
            const subscription = fixture.store.onDidChange(() => announced++);
            await fixture.store.change(disabling("project", MAIL_OFF));

            subscription.dispose();
            await fixture.store.change(disabling("project", SHOP_OFF));
            await fixture.storeElsewhere("allProjects", { disabled: [ACME_OFF] }, { notify: true });

            expect(announced).toBe(1);
        });

        it("round-trips template ids with quotes, hashes and at signs", async () => {
            const odd: TemplateSwitch = { source: `${ACME}#"x"`, templateId: '"@#' };

            await fixture.store.change(disabling("allProjects", odd));

            expect((await fixture.store.readStored()).allProjects).toEqual({ disabled: [odd] });
        });

        it("reads no switch once every one is enabled", async () => {
            await fixture.store.change(disabling("project", MAIL_OFF));

            await fixture.store.change(enabling("project", MAIL_OFF));

            expect(fixture.store.read()).toEqual(stored([]));
        });
    });
}
