/** The slice of a moddle element the review reads. */
export interface ModdleElementLike {
    readonly $type: string;
    readonly id?: string;
    readonly name?: string;
    readonly processRef?: ModdleElementLike;
}
