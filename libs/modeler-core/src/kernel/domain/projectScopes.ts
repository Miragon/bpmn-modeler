/**
 * Which projects a user's choice applies to: the open one, or every one the
 * user opens; in the order the core offers them.
 */
export const PROJECT_SCOPES = ["project", "allProjects"] as const;

export type ProjectScope = (typeof PROJECT_SCOPES)[number];
