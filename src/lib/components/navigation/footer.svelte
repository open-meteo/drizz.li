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
			<span>© {year} Drizz.li</span>
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
