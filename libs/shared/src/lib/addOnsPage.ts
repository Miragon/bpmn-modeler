/**
 * Which add-ons page a host serves: the list with the detail beside it or in
 * its place (`list`), the list whose rows open the detail in an editor tab
 * (`listWithTab`), or that tab's one add-on (`detail`). A host writes it into
 * the shell; one that writes nothing serves the list.
 */
export const ADD_ONS_PAGES = ["list", "listWithTab", "detail"] as const;

export type AddOnsPage = (typeof ADD_ONS_PAGES)[number];

export const ADD_ONS_PAGE_ATTRIBUTE = "data-add-ons-page";

export function addOnsPageOf(written: string | undefined): AddOnsPage {
    return ADD_ONS_PAGES.find((page) => page === written) ?? "list";
}

export function addOnsPageAttributes(page: AddOnsPage): Readonly<Record<string, string>> {
    return { [ADD_ONS_PAGE_ATTRIBUTE]: page };
}
