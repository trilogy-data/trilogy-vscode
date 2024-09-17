import * as esbuild from 'esbuild';
import {resolve} from 'path';
import { fileURLToPath } from 'url';
import {dirname} from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');


/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
    name: 'esbuild-problem-matcher',

    setup(build) {
        build.onStart(() => {
            console.log('[watch] build started');
        });
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${text}`);
                console.error(`    ${location.file}:${location.line}:${location.column}:`);
            });
            console.log('[watch] build finished');
        });
    },
};
const entryConfigs = [
    {
      entryPoints: ['src/extension.ts'],
      outfile: 'dist/extension.js',
    },
    {
      entryPoints: ['src/webViews/config/config.tsx'],
      outfile: 'dist/webviews/config.js',
    },
    {
        entryPoints: ['src/webViews/query/queryPanelContent.tsx'],
        outfile: 'dist/webviews/query.js',
      },
      {
        entryPoints: ['src/webViews/render/renderPanelContent.tsx'],
        outfile: 'dist/webviews/render.js',
      }
  ];
  
  async function main() {
    const contexts = await Promise.all(entryConfigs.map(config => {
      return esbuild.context({
        entryPoints: config.entryPoints,
        bundle: true,
        loader: { '.html': 'empty' },
        format: 'cjs',
        minify: production,
        sourcemap: !production,
        sourcesContent: false,
        platform: 'node',
        outfile: config.outfile,
        external: ['vscode', 'aws-sdk', 'mock-aws-s3', 'nock'],
        logLevel: 'silent',
        define: {
          'process.env.NODE_ENV': '"production"',
        },
        plugins: [
          esbuildProblemMatcherPlugin,
        ],
      });
    }));
  
    if (watch) {
      await Promise.all(contexts.map(ctx => ctx.watch()));
    } else {
      await Promise.all(contexts.map(ctx => ctx.rebuild()));
      await Promise.all(contexts.map(ctx => ctx.dispose()));
    }
  }
  
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });