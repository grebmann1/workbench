// @ts-nocheck
const searchParams = new URLSearchParams(window.location.search)
const locale = searchParams.get('locale')

// Locale packs are not shipped in the hosted workbench dist (they added ~16MB).
if (locale != null && locale !== 'en' && locale !== 'en-us') {
  console.warn(`[workbench] Locale pack "${locale}" is not bundled; using English.`)
}

await import('./main.workbench')

export {}
