import type { FitnessFunction } from "./fitnessFunction";

function escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namesId(text: string, id: string): boolean {
    return new RegExp(`(?<![\\w-])${escapeRegExp(id)}(?![\\w-])`).test(text);
}

// An agent reading a rule in a skill finds the fitness function that measures it there.
export function registryProblems(
    functions: readonly FitnessFunction[],
    skillTexts: ReadonlyMap<string, string>,
): string[] {
    const seen = new Set<string>();
    return functions.flatMap(({ id, reliesOn }) => {
        const problems: string[] = [];
        if (seen.has(id)) {
            problems.push(`${id} is registered twice`);
        }
        seen.add(id);
        const skillText = skillTexts.get(reliesOn.skill);
        if (skillText === undefined) {
            problems.push(`${id} relies on the skill ${reliesOn.skill}, which does not exist`);
        } else if (!namesId(skillText, id)) {
            problems.push(`the skill ${reliesOn.skill} does not name ${id}`);
        }
        return problems;
    });
}
