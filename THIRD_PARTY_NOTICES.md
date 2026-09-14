# Third-party notices

VidyCut-authored source uses the MIT license in LICENSE. The editor's application source, branding, icons, text presets and sample artwork are original to this project. The sample landscape was generated for VidyCut and animated with FFmpeg; its quiet sound track was synthesized.

The application uses open-source packages. Their copyright notices and licenses remain in their npm distributions; the lockfile records exact resolved versions. A machine-readable list of installed package names, versions and declared licenses is provided in docs/dependencies.json. This inventory is not a replacement for each upstream license.

The main families are React, Vite, Zustand, Immer, Zod, idb, Mediabunny, Radix UI, Tailwind CSS, class-variance-authority, clsx, tailwind-merge, Supabase JS, Express, Helmet, express-rate-limit, cors, pg, multer, dotenv, TypeScript and the test/build tooling.

## FFmpeg

`@ffmpeg/ffmpeg` is the JavaScript worker wrapper. The installed `@ffmpeg/core` **0.12.10** package identifies its compiled single-threaded core as **GPL-2.0-or-later**, including the enabled codec libraries. This core is a separate third-party component; it is not original VidyCut code or covered by the application MIT notice. `scripts/copy-ffmpeg.mjs` copies those installed runtime files without modifying them.

Upstream source and build information:

- [FFmpeg WASM repository and build scripts](https://github.com/ffmpegwasm/ffmpeg.wasm)
- [FFmpeg source repository](https://git.ffmpeg.org/ffmpeg.git)
- [FFmpeg license and redistribution information](https://ffmpeg.org/legal.html)

Preserve upstream notices and satisfy the applicable corresponding-source requirements when redistributing the compiled core, including any modifications and enabled codec dependencies. The source package installs the core from its pinned npm dependency; it does not claim to reproduce the full FFmpeg toolchain from VidyCut's application sources. Check the distribution/license arrangement for your deployment before redistribution.

The native server worker invokes the operator's installed FFmpeg/ffprobe. Its configured build and enabled codecs retain their own licenses. No codec patent or third-party asset license is granted by VidyCut.
