# simpleLightbox (personal fork)

A lightweight, dependency-free lightbox for responsive image galleries, used in
my WordPress theme. This is a **personal fork**, kept public as a reference for
a blog post — not a maintained, drop-in library.

## Heritage

- **Base:** [dbrekalo/simpleLightbox](https://github.com/dbrekalo/simpleLightbox) (MIT), rewritten to ES6.
- **Pinch-to-zoom:** adapted from [byronjohnson/litelight](https://github.com/byronjohnson/litelight) (MIT).
- **Added on top:** swipe navigation and SVG icon support. On-demand asset loading, i18n and accessibility are handled in the theme, not here.

## Status

Archived and read-only. These files (`simpleLightbox.js` + `simpleLightbox.scss`)
are a **snapshot** of the source as it lives in my theme — the repository does
not track the theme and is not published to npm. There is no build output here:
the files are ES6/SCSS source that the theme compiles and wires up by hand
(initialisation, enqueueing, localisation). It is not a drop-in library, and
there is no support, issue tracking or pull-request handling.

## License

MIT — see [LICENSE](LICENSE). The notice retains the copyright of dbrekalo
(base) and byronjohnson (pinch-to-zoom) alongside my own.

## Read more

The background and the design decisions behind this fork are written up (in
German): [Lightbox für WordPress – ohne Plugin](https://marcelbest.com/webdesign/2026/lightbox-fuer-wordpress-ohne-plugin/).
