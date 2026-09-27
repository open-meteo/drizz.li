<script lang="ts">
	import { href } from '$lib/i18n';
	import * as m from '$lib/paraglide/messages';

	import LogoMark from './logo-mark.svelte';

	// A hand-picked set of the prerendered city pages (see
	// routes/weather/locations/city-names100.json) — instant navigation targets
	// that double as SEO entry points.
	const popularCities: { slug: string; label: string }[] = [
		{ slug: 'london', label: 'London' },
		{ slug: 'tokyo', label: 'Tokyo' },
		{ slug: 'berlin', label: 'Berlin' },
		{ slug: 'sydney', label: 'Sydney' },
		{ slug: 'singapore', label: 'Singapore' },
		{ slug: 'dubai', label: 'Dubai' },
		{ slug: 'los-angeles', label: 'Los Angeles' },
		{ slug: 'hong-kong', label: 'Hong Kong' },
		{ slug: 'istanbul', label: 'Istanbul' },
		{ slug: 'seoul', label: 'Seoul' },
		{ slug: 'mexico-city', label: 'Mexico City' },
		{ slug: 'sao-paulo', label: 'São Paulo' }
	];

	const forecastLinks = [
		{ href: href('/weather/week'), label: m.nav_week() },
		{ href: href('/weather/compare'), label: m.nav_compare() },
		{ href: href('/weather/14-day'), label: m.nav_14day() },
		{ href: href('/weather/air-quality'), label: m.nav_air_quality() },
		{ href: href('/weather/seasonal'), label: m.page_seasonal_subtitle() },
		{ href: href('/weather/historical'), label: m.page_historical_subtitle() },
		{ href: href('/weather/maps'), label: m.nav_maps() }
	];

	const year = new Date().getFullYear();
</script>

<footer class="mt-16 border-t border-border bg-card/60">
	<div class="mx-auto w-full max-w-[1536px] px-4 py-10 lg:px-8">
		<div class="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
			<!-- Brand -->
			<div class="max-w-xs">
				<div class="flex items-center gap-2">
					<span
						class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground"
					>
						<LogoMark />
					</span>
					<span class="text-lg font-bold tracking-tight">Drizz.li</span>
				</div>
				<p class="mt-3 text-sm leading-relaxed text-muted-foreground">
					{m.footer_tagline()}
				</p>
				<p class="mt-3 text-xs text-muted-foreground">
					{m.footer_data_by()}
					<a
						class="font-medium underline-offset-2 hover:text-foreground hover:underline"
						href="https://open-meteo.com"
						target="_blank"
						rel="noopener noreferrer">Open-Meteo</a
					>
				</p>
				<!-- Open source is part of the identity: whole app under AGPL, with a
				     fork button like the Open-Meteo maps carry. -->
				<p class="mt-3 text-xs text-muted-foreground">
					{m.footer_open_source()}
				</p>
				<div class="mt-3 flex flex-wrap items-center gap-2">
					<a
						class="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
						href="https://github.com/open-meteo/drizz.li"
						target="_blank"
						rel="noopener noreferrer"
					>
						<!-- GitHub mark -->
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
							/>
						</svg>
						{m.oss_github()}
					</a>
					<a
						class="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2.5 py-1.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
						href="https://github.com/open-meteo/drizz.li/fork"
						target="_blank"
						rel="noopener noreferrer"
					>
						<!-- fork icon (Octicons repo-forked) -->
						<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"
							/>
						</svg>
						{m.oss_fork()}
					</a>
				</div>
			</div>

			<!-- Forecasts -->
			<nav aria-label={m.footer_forecasts()}>
				<h3 class="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
					{m.footer_forecasts()}
				</h3>
				<ul class="mt-3 flex flex-col gap-2 text-sm">
					{#each forecastLinks as link (link.href)}
						<li>
							<a
								class="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
								href={link.href}>{link.label}</a
							>
						</li>
					{/each}
				</ul>
			</nav>

			<!-- Popular locations (spans two columns of links) -->
			<nav aria-label={m.footer_popular()} class="lg:col-span-2">
				<h3 class="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
					{m.footer_popular()}
				</h3>
				<ul class="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
					{#each popularCities as city (city.slug)}
						<li>
							<a
								class="text-foreground/80 underline-offset-2 hover:text-foreground hover:underline"
								href={href('/weather/week/[location]', { location: city.slug })}
								>{m.city_weather({ city: city.label })}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
		</div>

		<!-- Bottom bar: legal -->
		<div
			class="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border/70 pt-5 text-xs text-muted-foreground sm:flex-row sm:items-center"
		>
			<span>
				© {year} Drizz.li ·
				<a
					class="underline-offset-2 hover:text-foreground hover:underline"
					href="https://github.com/open-meteo/drizz.li/blob/main/LICENSE"
					target="_blank"
					rel="noopener noreferrer">AGPL-3.0</a
				>
			</span>
			<nav aria-label={m.legal_nav()} class="flex flex-wrap items-center gap-x-5 gap-y-1">
				<a class="underline-offset-2 hover:text-foreground hover:underline" href={href('/about')}
					>{m.legal_about()}</a
				>
				<a
					class="underline-offset-2 hover:text-foreground hover:underline"
					href={href('/legal/imprint')}>{m.legal_imprint()}</a
				>
				<a
					class="underline-offset-2 hover:text-foreground hover:underline"
					href={href('/legal/privacy')}>{m.legal_privacy()}</a
				>
			</nav>
		</div>
	</div>
</footer>
