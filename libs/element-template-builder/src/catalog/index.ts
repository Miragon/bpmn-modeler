import type { Engine } from "@miragon/bpmn-modeler-types";

import { C7_CATALOG } from "./c7";
import { C8_CATALOG } from "./c8";
import type {
    BindingSpec,
    BindingVariant,
    EngineCatalog,
    FeelSupport,
    PropertyType,
} from "./types";

export type * from "./types";

export function catalogFor(engine: Engine): EngineCatalog {
    return engine === "c7" ? C7_CATALOG : C8_CATALOG;
}

export function bindingSpecOf(
    catalog: EngineCatalog,
    bindingType: unknown,
): BindingSpec | undefined {
    return catalog.bindings.find((spec) => spec.type === bindingType);
}

/** The spec's narrower rules for the variant `binding` selects, if any. */
export function variantOf(
    spec: BindingSpec,
    binding: Readonly<Record<string, unknown>>,
): BindingVariant | undefined {
    if (!spec.variants) {
        return undefined;
    }
    const selected = binding[spec.variants.field];
    return typeof selected === "string" ? spec.variants.values[selected] : undefined;
}

export function allowedTypes(
    spec: BindingSpec,
    binding: Readonly<Record<string, unknown>>,
): readonly PropertyType[] {
    return variantOf(spec, binding)?.types ?? spec.types;
}

export function feelSupport(
    spec: BindingSpec,
    binding: Readonly<Record<string, unknown>>,
): FeelSupport {
    return variantOf(spec, binding)?.feel ?? spec.feel ?? "none";
}

/** A value that keeps a String, Text or Hidden property of the binding valid. */
export function sampleValue(
    spec: BindingSpec,
    binding: Readonly<Record<string, unknown>>,
): string | boolean | undefined {
    return variantOf(spec, binding)?.sample ?? spec.sample;
}

/** A new binding object: its type plus every field that starts with a value. */
export function initialBinding(spec: BindingSpec): Record<string, unknown> {
    const binding: Record<string, unknown> = { type: spec.type };
    for (const field of spec.fields) {
        if (field.initial !== undefined) {
            binding[field.key] = field.initial;
        }
    }
    return binding;
}
