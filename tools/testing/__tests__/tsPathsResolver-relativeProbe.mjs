// Imports a sibling *without* extension to exercise the relative-probe branch
// of the resolver hook. The sibling `../tsPathsResolver.mjs` is spelled without
// `.mjs` here deliberately; the hook must probe and find it.
import '../tsPathsResolver';

export const ok = true;
