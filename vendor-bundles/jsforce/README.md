# Vendored jsforce

Workbench runs a patched [grebmann1/jsforce](https://github.com/grebmann1/jsforce) build (BlackTab 401 skip list + `_maxSessionRefreshRetries`), currently `013ac22cc62bb7516f405346bf73925c0950805a`.

`package.json` points at `jsforce-3.10.19.tgz` because the fork git tree does not include `lib/` or `dist/`, and this repo's `allowScripts` policy skips the fork `prepare` script.

Rebuild after a fork change:

```sh
# in the jsforce checkout, on the patched commit
npm run build
npm pack --pack-destination /path/to/workbench/vendor-bundles/jsforce
```

Then:

```sh
npm install
npm run build:vendor:jsforce
```
