import { build, context } from 'esbuild';

const options = {
  entryPoints: ['src/content.ts', 'src/popup.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  logLevel: 'info',
};

if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
} else {
  await build(options);
}
