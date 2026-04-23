import path from 'path';
import { transformSync } from '@babel/core';
import syntaxDecorators from '@babel/plugin-syntax-decorators';
import transformTypescript from '@babel/plugin-transform-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import babel from '@rollup/plugin-babel';
import json from '@rollup/plugin-json';
import inject from '@rollup/plugin-inject';
import alias from '@rollup/plugin-alias';
import nodePolyfills from 'rollup-plugin-polyfill-node';

const stripTypescript = () => ({
    name: 'strip-typescript',
    transform(code, id) {
        if (!id.endsWith('.ts')) {
            return null;
        }
        const result = transformSync(code, {
            filename: id,
            babelrc: false,
            configFile: false,
            sourceMaps: true,
            plugins: [
                [syntaxDecorators, { decoratorsBeforeExport: false }],
                [transformTypescript, { allowDeclareFields: true, onlyRemoveTypeImports: true }],
            ],
        });
        if (!result) {
            return null;
        }
        return {
            code: result.code || code,
            map: result.map || null,
        };
    },
});



/*export default {
  input: 'packages/workers/src/openaiWorker/worker.js', // your source file
  output: {
	file: 'dist/extension/workers/openaiWorker/worker.js',
	format: 'iife', // immediately-invoked function expression — suitable for <script> tags
	sourcemap: true // optional but helpful for debugging
  },
  plugins: [
	resolve(), // tells Rollup how to find node modules in node_modules
	commonjs(), // converts CommonJS modules to ES6, so they can be included in a Rollup bundle
	babel({
	  babelHelpers: 'bundled',
	  presets: ['@babel/preset-env']
	})
  ]
};*/

export default (args) => {
	return [
		{
			input: 'packages/workers/src/metadata.worker.js', // your source file
			output: {
				file: 'assets/extension/libs/workers/metadata.worker.js',
				format: 'es',
				intro: 'var global = typeof globalThis !== "undefined" ? globalThis : self;',
				sourcemap: true // optional but helpful for debugging
			},
		plugins: [
			json(),
			resolve({ browser: true, preferBuiltins: false, extensions: ['.mjs', '.js', '.json', '.ts'] }),
			alias({
				entries: [
					{ find: 'buffer', replacement: path.resolve(__dirname, "../../node_modules/buffer/index.js") },
				{ find: 'imported/jsforce', replacement: path.resolve(__dirname, "../../assets/extension/libs/jsforce/jsforce.js") }
			]
		}),
		inject({
			Buffer: ['buffer', 'Buffer']
		}),
		stripTypescript(),
		commonjs(), // converts CommonJS modules to ES6, so they can be included in a Rollup bundle
		nodePolyfills(),
		babel({
			babelHelpers: 'bundled',
			presets: ['@babel/preset-env']
		})
	]
},
{
	input: 'packages/workers/src/accessAnalyzer.worker.js', // your source file
	output: {
		file: 'assets/extension/libs/workers/accessAnalyzer.worker.js',
		format: 'es',
		sourcemap: true // optional but helpful for debugging
	},
	plugins: [
		json(),
		resolve({ browser: true, preferBuiltins: false, extensions: ['.mjs', '.js', '.json', '.ts'] }),
		alias({
			entries: [
				{ find: 'buffer', replacement: path.resolve(__dirname, "../../node_modules/buffer/index.js") },
				{ find: 'imported/jsforce', replacement: path.resolve(__dirname, "../../assets/extension/libs/jsforce/jsforce.js") },
					{ find: 'imported/sf', replacement: path.resolve(__dirname, "../../packages/shared/dist/modules/sf/sf.js") }
				]
			}),
			inject({
				Buffer: ['buffer', 'Buffer']
			}),
			stripTypescript(),
			commonjs(), // converts CommonJS modules to ES6, so they can be included in a Rollup bundle
			nodePolyfills(),
			babel({
				babelHelpers: 'bundled',
				presets: ['@babel/preset-env']
			})
		]
	}
	]
};