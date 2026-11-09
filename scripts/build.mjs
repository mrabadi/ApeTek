import { build as viteBuild } from 'vite';
import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
await mkdir('dist/desktop', { recursive: true });
await copyFile('assets/icon.png', 'dist/desktop/icon.png');
await viteBuild({ base: './', build: { outDir: 'dist/renderer', emptyOutDir: true, rollupOptions: { input: { main: 'index.html', raster: 'raster.html' } } } });
await build({ entryPoints: ['src/desktop/main.ts', 'src/desktop/preload.ts'], bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron'], outdir: 'dist/desktop', outExtension: { '.js': '.cjs' }, sourcemap: true });
