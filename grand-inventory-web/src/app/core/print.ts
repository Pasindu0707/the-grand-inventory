/**
 * Every printed sheet opens in its own tab, so the screen it came from - with
 * its ticks, its filters, its scroll position - is still there afterwards.
 * `print=1` has the sheet open the print dialog itself once it has loaded.
 */
export function openPrint(path: string, query: Record<string, string> = {}): void {
    const params = new URLSearchParams({ ...query, print: '1' });
    window.open(`${path}?${params.toString()}`, '_blank');
}
