import { build, emptyDir } from 'jsr:@deno/dnt'

const outDir = './.npm'

await emptyDir(outDir)

await build({
  entryPoints: ['./src/index.ts'],
  outDir,
  shims: {
    deno: 'dev',
  },
  scriptModule: 'cjs',
  typeCheck: 'both',
  package: {
    name: '@orama/core',
    version: '0.0.1',
    description: 'JavaScript and TypeScript client for OramaCore',
    license: 'AGPL-3.0',
    author: {
      name: 'Michele Riva',
      email: 'michele@orama.com',
    },
    repository: {
      type: 'git',
      url: 'git+https://github.com/oramasearch/oramacore.git',
    },
    bugs: {
      url: 'https://github.com/oramasearch/oramacore/repo/issues',
    },
  },
  postBuild() {
    Deno.copyFileSync('./LICENSE.md', `${outDir}/LICENSE.md`)
    Deno.copyFileSync('./README.md', `${outDir}/README.md`)
  },
})
