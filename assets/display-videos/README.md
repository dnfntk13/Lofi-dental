# Display video exports

These files are used only by `/display`. Existing source videos are retained.

- `angelica-before-after-hq.mp4`: encoded from the original 1080x1920, 30 fps HEVC video, not the previous 406x720 proxy. No sharpening or color changes.
- Other `*-hq.mp4` files: repository 406x720 sources scaled to 610x1080 with Lanczos and light luma sharpening (`unsharp=5:5:0.25:5:5:0`). These are upscaled versions, not native HD restorations. No generated details, crop, speed, or color changes.
- Encoding: H.264, libx264 slow, CRF 17, yuv420p, original frame rate, faststart. Audio omitted because signage plays muted.
- All five files were decoded end to end without errors. Native higher-resolution originals should replace upscaled exports when available.
