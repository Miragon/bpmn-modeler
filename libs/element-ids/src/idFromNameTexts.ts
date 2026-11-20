export const ID_FROM_NAME_TEXTS = {
    generate: "Generate from name",
    review: "Review all IDs…",
    rename: "Rename the ID to {id}",
    nameMissing: "Add a name to generate the ID from it.",
    alreadyFollowsName: "The ID already follows the name.",
} as const;

/** Every key the ID-from-name links pass to translate(). */
export const ID_FROM_NAME_KEYS: readonly string[] = Object.values(ID_FROM_NAME_TEXTS);
