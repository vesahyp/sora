// Headless Chromium draws WebGL in software unless told otherwise: the 3D view (ADR 0006) then ran
// at 3 frames a second and every phone script's clock ran out. On the Mac's GPU it runs at 45 to
// 60. Every script that opens the game launches with this.
export const GPU = { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] };
