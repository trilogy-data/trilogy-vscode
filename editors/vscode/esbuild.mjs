import * as esbuild from 'esbuild';
import {resolve} from 'path';
import { fileURLToPath } from 'url';
import {dirname} from 'path';
import {copyFileSync, watchFile} from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Copy CSS file
const cssSource = resolve(__dirname, 'src/media/input.css');
const cssDest = resolve(__dirname, 'dist/output.css');

function copyCSS() {
  copyFileSync(cssSource, cssDest);
  console.log('[css] copied input.css to dist/output.css');
}

copyCSS();


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
      outfile: 'dist/webViews/config/config.js',
    },
    {
        entryPoints: ['src/webViews/query/queryPanelContent.tsx'],
        outfile: 'dist/webViews/query/query.js',
      },
      {
        entryPoints: ['src/webViews/render/renderPanelContent.tsx'],
        outfile: 'dist/webViews/render/render.js',
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
        external: ['vscode', '@duckdb/node-api', '@duckdb/node-bindings'],
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
      // Watch CSS file for changes
      watchFile(cssSource, () => copyCSS());
    } else {
      await Promise.all(contexts.map(ctx => ctx.rebuild()));
      await Promise.all(contexts.map(ctx => ctx.dispose()));
    }
  }
  
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });