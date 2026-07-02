import { defineConfig } from 'tsup'

// Bundle to Node-runnable ESM + CJS with type declarations. `cfb` and `fflate`
// (package.json dependencies) are externalized automatically, so consumers dedupe
// them. Bundling sidesteps TypeScript's extensionless-relative-import ESM pitfall.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
})
