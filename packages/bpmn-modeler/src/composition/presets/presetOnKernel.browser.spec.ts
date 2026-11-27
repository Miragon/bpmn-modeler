// Pins what moving createModeler onto createSurface would change, before anything switches:
// each line below is a module, provider, __init__, config or moddle line the switch moves, adds
// or removes. Every option variant of the preset pins is built both ways; one whose change
// equals the defaults' reads "(as the defaults)".
import Modeler from "bpmn-js/lib/Modeler";
import { afterEach, describe, expect, it } from "vitest";
import { ENGINES, type Engine } from "@miragon/bpmn-modeler-types";
import { SURFACE_MODE_SERVICE, type SurfaceModeService } from "@miragon/bpmn-modeler-types/domain";

import { normalizeMode } from "../../kernel/domain/surfaceMode";
import type { CreateModelerOptions } from "../../modeler/port/publicApi";
import { createModeler } from "../createModeler";
import { createSurface } from "../createSurface";
import { modelerFeatures } from "./modelerFeatures";
import {
    afterPaint,
    mountWithPanel,
    removeMounts,
    type SurfaceMount,
} from "../../__fixtures__/surfaceMount";
import {
    disagreementsWithInjector,
    type DidiInjector,
    type DiModule,
} from "../../__fixtures__/diModuleAssembly";
import {
    optionDelta,
    surfacePinsOf,
    type ModdlePackage,
    type SurfacePins,
} from "../../__fixtures__/presetPinText";
import { modelerVariants, VALUE_ROLES } from "../../__fixtures__/presetPinOptions";

interface BuiltSurface {
    getService<T = unknown>(name: string): T;
    destroy(): void;
}

interface OptionalLookup {
    get<T>(name: string, strict: false): T | null;
}

type Build = (mount: SurfaceMount, options: CreateModelerOptions) => Promise<BuiltSurface>;

const buildPreset: Build = ({ container }, options) => createModeler(container, options);

const buildOnKernel: Build = ({ container, panel }, options) =>
    createSurface(container, {
        base: Modeler,
        features: modelerFeatures(container, options),
        mode: normalizeMode(options.mode),
        extraRoots: [panel],
        handleGlobalEscape: options.handleGlobalEscape,
    });

async function pinsOf(
    build: Build,
    engine: Engine,
    options: Partial<CreateModelerOptions>,
): Promise<SurfacePins> {
    const mount = mountWithPanel();
    const surface = await build(mount, {
        engine,
        propertiesPanel: { parent: mount.panel },
        ...options,
    });
    try {
        const injector = surface.getService<DidiInjector & OptionalLookup>("injector");
        const pins = surfacePinsOf(
            surface.getService<{ modules: DiModule[] }>("config"),
            surface.getService<{ getPackages(): ModdlePackage[] }>("moddle").getPackages(),
            VALUE_ROLES,
            injector.get<SurfaceModeService>(SURFACE_MODE_SERVICE, false)?.get(),
        );
        expect(disagreementsWithInjector(pins.assembly, injector)).toEqual([]);
        return pins;
    } finally {
        await afterPaint();
        surface.destroy();
    }
}

async function switchDelta(engine: Engine, options: Partial<CreateModelerOptions>) {
    return optionDelta(
        await pinsOf(buildPreset, engine, options),
        await pinsOf(buildOnKernel, engine, options),
    );
}

describe("createModeler on createSurface", () => {
    afterEach(removeMounts);

    it.each(ENGINES)(
        "pins what the switch changes for %s, with each option variant",
        async (engine) => {
            const defaults = await switchDelta(engine, {});
            const lines = [
                `# createModeler (${engine}) built by createSurface(modelerFeatures): what changes against createModeler (${engine})`,
                "",
                "## default options",
                ...(defaults.length > 0 ? defaults : ["(no change)"]),
            ];
            for (const [label, options] of modelerVariants(engine)) {
                const delta = await switchDelta(engine, options);
                const same = delta.join("\n") === defaults.join("\n");
                lines.push("", `## ${label}`, ...(same ? ["(as the defaults)"] : delta));
            }
            await expect(`${lines.join("\n")}\n`).toMatchFileSnapshot(
                `./__snapshots__/presetOnKernel/modeler-${engine}.delta.txt`,
            );
        },
    );
});
