const esbuild = require("esbuild");
const { version } = require("./package.json");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Compile-time constants shared by both bundles. __BUILD_ID__ detects a new
// build at runtime to reset firstTimeUse; __PKG_VERSION__ keeps the User-Agent
// in step with package.json.
const define = {
	'__BUILD_ID__': JSON.stringify(Date.now().toString()),
	'__PKG_VERSION__': JSON.stringify(version),
};

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

async function main() {
	// CLI bundle
	const cliCtx = await esbuild.context({
		entryPoints: [
			'src/cli.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/cli.js',
		banner: {
			js: '#!/usr/bin/env node',
		},
		define,
		logLevel: 'silent',
		plugins: [
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});

	// Library bundle (for programmatic usage)
	const libCtx = await esbuild.context({
		entryPoints: [
			'src/index.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/index.js',
		external: ['axios'], // Don't bundle axios for library usage
		define,
		logLevel: 'silent',
		plugins: [
			esbuildProblemMatcherPlugin,
		],
	});

	if (watch) {
		await Promise.all([
			cliCtx.watch(),
			libCtx.watch()
		]);
	} else {
		await Promise.all([
			cliCtx.rebuild(),
			libCtx.rebuild()
		]);
		await cliCtx.dispose();
		await libCtx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
