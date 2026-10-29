/** @type {import('@inlang/paraglide-js').CompilerOptions} */
export const paraglideOptions = {
	project: './project.inlang',
	outdir: './src/lib/paraglide',
	// Share routing settings between prepare/check and the Vite compiler.
	strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
	trailingSlash: 'always',
	urlPatterns: [
		{
			pattern: '/:path(.*)?',
			localized: ['en', 'de', 'es', 'fr', 'it'].map((locale) => [locale, `/${locale}/:path(.*)?`])
		}
	]
};
