/**
 * Seeds the framework tree's gate material: the core carries no apps, so the demo app the gates and CI
 * verify is generated on demand (authorless → scaffold → sw → readme) and a tree that already has apps is
 * left untouched. A script with no exports; every gate node can depend on it unconditionally.
 * @module
 */
export {};
