# Browser compatibility and troubleshooting

## Compatibility

| Environment                                 | Expected capability                                                                     | Verification in this delivery                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Current Chromium desktop on HTTPS/localhost | Core edit/preview; WebCodecs when supported; FFmpeg WASM; recording with permissions    | Chromium core UI and WASM export tested on an internal HTTP origin; secure WebCodecs and hardware recording require device testing |
| Chromium on ordinary HTTP                   | Local import/preview and WASM export; secure-context APIs may be absent                 | Used for the browser QA in this project                                                                                            |
| Safari/macOS and iOS                        | Canvas/HTML5 editing; codec, worker, memory and recording differences                   | Not device-tested                                                                                                                  |
| Firefox                                     | HTML5/Canvas editor and compatible WASM fallback; WebCodecs encoder availability varies | Not device-tested                                                                                                                  |
| Android/iOS phones                          | Responsive tools/preview/timeline layout, pointer gestures                              | Layout implementation present; physical touch, pinch, recording and memory tests remain                                            |

Codec support is detected at runtime. H.264/AAC MP4 and VP8/VP9 WebM are preferred inputs. MOV is a container: some MOV codecs will need conversion before browser import. A file extension alone does not make a codec decodable. GPU effects require WebGL. Camera/screen/microphone access, service workers, clipboard and some encoders require HTTPS or localhost and explicit browser permission.

Browser versions are not hard-coded as a guarantee. Test your actual browser/device with representative footage before a release or a long edit.

## Common problems

**Nothing opens after extracting.** Use Node 22.12+ and the launcher or npm commands in README. Do not open index.html through file://. Do not move files out of the extracted folder. Keep the development server running and visit localhost:4173.

**npm is not recognized.** Install Node.js with npm, close and reopen your terminal, and run the launcher again. On managed devices your administrator may need to allow development tools.

**Port 4173 is occupied.** Stop the other local application or change the port in Vite/the supplied static server. Use the corresponding URL. Do not stop unrelated system processes.

**A video format is unsupported.** Convert the source to H.264 MP4 with AAC, or VP8/VP9 WebM, using a codec-compatible FFmpeg installation. VidyCut validates MIME type and file signatures; renaming the extension does not convert a video.

**Media is missing after importing JSON.** JSON contains media IDs and edit decisions. Import/relink the original files. Media remains in the browser that imported it, unless you explicitly upload it to your configured object store. Use the same browser profile and origin when reopening local projects.

**Preview is slow.** Lower preview quality, disable expensive effects while editing, or create a proxy from a media card. Proxy creation needs a compatible WebCodecs encoder. Lower preview quality does not reduce export resolution. Reverse preview requires repeated seeks and is slower than forward playback.

**Reverse sound is missing.** Reverse clip audio is currently mixed in exports; live reverse playback is silent. Pitch follows playback speed; independent formant-preserving pitch shifting is not implemented. The noise-reduction control is a high-pass filter, not a learned denoiser.

**Export takes longer than the video.** The WASM fallback renders each selected frame, then encodes in a worker. Its progress reflects frames processed and encoder phases, not elapsed playback time. Complex filters, 4K layers and unsupported hardware codecs can be slow. Keep the tab active. Cancel terminates its worker.

**FFmpeg stays at loading or fails to initialize.** Check that ffmpeg/worker.js, ffmpeg/const.js, ffmpeg/errors.js, ffmpeg/ffmpeg-core.js and ffmpeg/ffmpeg-core.wasm are served from the same origin. Run `node scripts/copy-ffmpeg.mjs` and rebuild if missing. Do not rewrite missing worker paths to index.html. Check your CSP, JavaScript MIME types and WASM MIME type. The installed core is single-threaded; it does not need a paid service or remote CDN.

**Export fails on a long project.** Browser/WASM memory and output buffering are finite. Reduce overlapping high-resolution layers, close other heavy tabs, or move to a device with more memory. There are no account-based export limits. The backend can transcode a flattened source; it does not yet render an arbitrary full project on the server. Streaming full-project export remains a release-scale task.

**Captions cannot generate.** Import/edit SRT/VTT locally without any provider. Automatic transcription requires your configured Whisper-compatible server and the optional authenticated API. The rest of the editor remains usable when it is absent.

**Cloud account is unavailable.** Configure public Supabase values at build time and server credentials only in the backend. Google/GitHub redirect URLs and provider credentials must be configured in Supabase. Guest editing needs none of this.

**Offline mode does not survive the first disconnect.** Open the editor and requested tools while connected before disconnecting. The service worker caches assets as used. A normal HTTP host other than localhost may not permit service workers. Browser storage can be evicted, so keep JSON and source-media backups.

**Text looks different after reopening.** Uploaded fonts are session-scoped. Upload the same font again, or choose an installed system font. Font distribution/licensing is the project owner's responsibility.

**A shortcut types into a field instead of editing.** Editing shortcuts intentionally ignore text inputs and contenteditable elements. Click the preview/timeline first. Review customizable mappings in Settings.

## Reporting reproducible issues

Record the browser/version, project dimensions, input codec and media duration, exact steps, whether the problem occurs with the original sample, and whether an export fails before rendering, during frames or during encoding. Share only media you are authorized to share. The application does not expose raw server errors to users.
