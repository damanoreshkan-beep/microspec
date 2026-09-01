/**
 * The arithmetic the Back-button routing runs on: how many history entries an overlay atom's value is worth,
 * kept pure and unit-tested so the invariant "system Back closes the top layer and never exits the app by
 * accident" is proven rather than inlined in the bootstrap. Exports `overlayDepth`.
 * @module
 */
export function overlayDepth(v: any): number;
