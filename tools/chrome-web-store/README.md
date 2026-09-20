# Chrome Web Store image set

Exports five 1280×800 feature screenshots, a 440×280 small promo tile, a 1400×560 marquee, and a 128×128 Workbench cloud icon. The screenshots use the same app-design replicas and fictional data as the product tour. Production app code is not modified.

The screenshot composition is full bleed with square outer corners, a short heading, and the full-height UI. The promo artwork shares the film's Salesforce blue palette and Workbench 2.0 branding. The cloud silhouette is preserved with the lettering updated to Workbench. The small tile stays readable without a miniature screenshot.

## Generate

Use Node 22 with the repository dependencies, Playwright Chromium, and the `zip` CLI installed:

```sh
node tools/chrome-web-store/render.mjs
# Optional separate output directory:
node tools/chrome-web-store/render.mjs --out=out/chrome-web-store-review
```

The script starts and closes its own local Vite server and browser. It captures the five shared demo states at 2× resolution, composes the store artwork, and checks dimensions, 24-bit RGB PNG encoding, and browser errors. Existing files with the generated names in the selected output directory are replaced.

Output under `out/chrome-web-store/`:

| Path                                  | Purpose                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| `screenshots/01…05-1280x800.png`      | Upload in order to the English screenshot slots          |
| `promotional/small-promo-440x280.png` | Small promo tile                                         |
| `promotional/marquee-1400x560.png`    | Optional marquee tile                                    |
| `icon/store-icon-128x128.png`         | Transparent Workbench cloud icon                         |
| `chrome-web-store-upload.zip`         | Convenient bundle to extract; not an extension package   |
| `UPLOAD-GUIDE.md`                     | Dashboard field mapping and source links                 |
| `preview.html`, `contact-sheet.png`   | Review the complete set                                  |
| `source-ui/`                          | Larger 2200×1150 source captures for further artwork     |
| `manifest.json`                       | File dimensions, encoding, sizes, and validation results |

Upload each PNG to its matching field. The review files and source captures are not store upload assets. This tool does not upload or publish the listing.

## Edit

- `artwork.mjs`: feature copy, selected film timestamps, and HTML templates.
- `artwork.css`: store screenshot and promo compositions.
- `apps/ui/src/product-tour/AppPreview.tsx`: shared app UI replicas.
- `logo.mjs`: rebuild the 128px and 500px Workbench logos in the shared preview assets. Run it before re-exporting images and film when changing the logo.

Requirements were checked on September 17, 2026 against [Chrome's listing specifications](https://developer.chrome.com/docs/webstore/cws-dashboard-listing) and [image guidance](https://developer.chrome.com/docs/webstore/best-listing). Recheck those pages before future store submissions in case the requirements change. Screenshots support localization; small promo and marquee images are global.

## Check

```sh
npx eslint tools/chrome-web-store/*.mjs
npx prettier --check tools/chrome-web-store
node --check tools/chrome-web-store/render.mjs
node --check tools/chrome-web-store/artwork.mjs
node tools/chrome-web-store/render.mjs
```

## Complete listing kit

After rendering the latest Salesforce blue film, generate matching images and assemble the complete handoff:

```sh
node tools/chrome-web-store/render.mjs --out=out/chrome-web-store-salesforce-blue
node tools/chrome-web-store/package.mjs
```

The kit includes the latest MP4, English captions, a fresh 3840×2160 YouTube thumbnail, copyable video title and description, the eight store images, a larger 500×500 transparent logo, and a step-by-step upload guide. The ZIP is written alongside `out/workbench-2.0-store-kit/`. Only the explicitly listed files are bundled.

Chrome Web Store embeds a YouTube URL for video; the MP4 must first be uploaded to YouTube. The kit guide covers visibility, embedding, subtitles, and the store image fields. Nothing is uploaded or published by these scripts.
