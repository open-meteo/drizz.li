/**
 * Shared PNG export for charts.
 *
 * Each chart composites itself (plot + icon bands + optional title + legend)
 * onto a canvas via `getExportImage`; those are stacked vertically over the
 * current theme background and downloaded as one PNG.
 */

/** A chart that can composite itself (plot + icons + legend) for export. */
export interface ExportableChart {
	getExportImage(opts?: { title?: string }): Promise<HTMLCanvasElement | null>;
}

/** One chart to export, with the title to render above it (e.g. panel name). */
export interface ChartExportItem {
	chart: ExportableChart | null | undefined;
	title?: string;
}

export interface ExportLegendItem {
	name: string;
	color: string;
	style?: 'point' | 'line' | 'dashed' | 'bar';
}

export interface ChartDownloadOptions {
	title?: string;
	legend?: ExportLegendItem[];
}

/** Resolves the page background so exports match the current theme. */
function exportBackground(): string {
	const bg = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
	return bg || '#ffffff';
}

function triggerDownload(url: string, name: string): void {
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.style.display = 'none';
	document.body.appendChild(link);
	link.click();
	requestAnimationFrame(() => {
		document.body.removeChild(link);
	});
}

/** Normalise either a bare chart or a {chart, title} item. */
function toItem(x: ChartExportItem | ExportableChart | null | undefined): ChartExportItem {
	if (x && 'getExportImage' in x) return { chart: x };
	return (x as ChartExportItem) ?? { chart: null };
}

/**
 * Stitch the given charts into one PNG and download it. Resolves once the
 * download has been triggered (or immediately if there is nothing to export).
 */
export async function downloadChartsPng(
	charts: Array<ChartExportItem | ExportableChart | null | undefined>,
	fileName: string,
	options: ChartDownloadOptions = {}
): Promise<void> {
	const items = charts
		.map(toItem)
		.filter(
			(it): it is ChartExportItem & { chart: ExportableChart } =>
				typeof it.chart?.getExportImage === 'function'
		);
	if (items.length === 0) return;

	// A supplementary panel must never prevent the remaining charts from being
	// downloaded. Invalid adapters are filtered above; rejected renders are
	// isolated here instead of aborting the complete Promise.all chain.
	const rendered = await Promise.allSettled(
		items.map((it) => it.chart.getExportImage({ title: it.title }))
	);
	const canvases = rendered.flatMap((result) =>
		result.status === 'fulfilled' &&
		result.value != null &&
		result.value.width > 0 &&
		result.value.height > 0
			? [result.value]
			: []
	);
	if (canvases.length === 0) return;

	const maxWidth = Math.max(...canvases.map((c) => c.width));
	const dpr = window.devicePixelRatio || 1;
	const padding = 12 * dpr;
	const gap = 14 * dpr;
	const rowHeight = 22 * dpr;
	const measure = document.createElement('canvas').getContext('2d');
	const legendRows: ExportLegendItem[][] = [];
	if (measure && options.legend?.length) {
		measure.font = `${12 * dpr}px system-ui, -apple-system, sans-serif`;
		let row: ExportLegendItem[] = [];
		let rowWidth = 0;
		for (const item of options.legend) {
			const width = 18 * dpr + measure.measureText(item.name).width;
			if (row.length > 0 && rowWidth + gap + width > maxWidth - padding * 2) {
				legendRows.push(row);
				row = [];
				rowWidth = 0;
			}
			row.push(item);
			rowWidth += (rowWidth > 0 ? gap : 0) + width;
		}
		if (row.length > 0) legendRows.push(row);
	}
	const titleHeight = options.title ? 34 * dpr : 0;
	const legendHeight = legendRows.length > 0 ? legendRows.length * rowHeight + 8 * dpr : 0;
	const totalHeight = titleHeight + canvases.reduce((sum, c) => sum + c.height, 0) + legendHeight;

	const canvas = document.createElement('canvas');
	canvas.width = maxWidth;
	canvas.height = totalHeight;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	ctx.fillStyle = exportBackground();
	ctx.fillRect(0, 0, maxWidth, totalHeight);

	const styles = getComputedStyle(document.documentElement);
	const foreground = styles.getPropertyValue('--foreground').trim() || '#1f2937';
	const muted = styles.getPropertyValue('--muted-foreground').trim() || '#6b7280';
	let y = 0;
	if (options.title) {
		ctx.fillStyle = foreground;
		ctx.font = `600 ${16 * dpr}px system-ui, -apple-system, sans-serif`;
		ctx.textBaseline = 'middle';
		ctx.fillText(options.title, padding, 17 * dpr);
		y += 34 * dpr;
	}
	for (const c of canvases) {
		ctx.drawImage(c, 0, y);
		y += c.height;
	}
	if (legendRows.length > 0) {
		y += 8 * dpr;
		ctx.font = `${12 * dpr}px system-ui, -apple-system, sans-serif`;
		ctx.textBaseline = 'middle';
		for (const row of legendRows) {
			let x = padding;
			for (const item of row) {
				const markerWidth = 12 * dpr;
				ctx.strokeStyle = item.color;
				ctx.fillStyle = item.color;
				ctx.lineWidth = 2 * dpr;
				ctx.setLineDash(item.style === 'dashed' ? [4 * dpr, 3 * dpr] : []);
				if (item.style === 'point') {
					ctx.beginPath();
					ctx.arc(x + markerWidth / 2, y + rowHeight / 2, 3 * dpr, 0, Math.PI * 2);
					ctx.fill();
				} else if (item.style === 'bar') {
					ctx.fillRect(x + 3 * dpr, y + 5 * dpr, 6 * dpr, 12 * dpr);
				} else {
					ctx.beginPath();
					ctx.moveTo(x, y + rowHeight / 2);
					ctx.lineTo(x + markerWidth, y + rowHeight / 2);
					ctx.stroke();
				}
				ctx.setLineDash([]);
				x += markerWidth + 6 * dpr;
				ctx.fillStyle = muted;
				ctx.fillText(item.name, x, y + rowHeight / 2);
				x += ctx.measureText(item.name).width + gap;
			}
			y += rowHeight;
		}
	}

	triggerDownload(canvas.toDataURL('image/png'), `${fileName}.png`);
}
