/** A context pad icon: the frame every pad entry draws its paths in, hidden from screen readers since its button names it. */
export function padIconSvg(paths: string): string {
    return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">${paths}</svg>`;
}
