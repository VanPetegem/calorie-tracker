<script lang="ts">
	import { onMount } from 'svelte';
	import { addDays, daysBetween } from '#lib/domain/dates.ts';
	import type { TrendPoint } from '#lib/domain/trend.ts';
	import { Card, SegmentedControl } from '#lib/components/ui/index.ts';
	import {
		RANGES,
		formatDay,
		formatKg,
		formatTick,
		goalLine,
		linePath,
		nearestIndex,
		niceTicks,
		parseRange,
		scale,
		visiblePoints,
		yDomain,
		type Goal,
		type RangeKey
	} from './chart.ts';

	/**
	 * The weigh-ins as dots and the trend as a line, in an inline SVG sized to its box (so the text keeps its size),
	 * with a range control (30 days, 90 days, 1 year, All) remembered on this device. A fixed range always spans its
	 * whole window, so a sparse series sits where its days are. The y axis fits the visible data with padding.
	 *
	 * Reading a point does not need a hover: a tap or a drag on the chart, or focus (the latest point) and the arrow
	 * keys, open the tooltip with its date, weight and trend; Escape or leaving closes it. The chart is a slider over
	 * the visible points whose value text is that same line, so the keys are announced. The SVG itself is hidden from
	 * assistive technology; a table of the visible points, hidden visually, takes its place. `goal` (the goal slope, 4b) draws a dashed line.
	 */
	type Props = {
		/** Weigh-ins with their trend, oldest first, as `trendSeries` returns them. */
		series: TrendPoint[];
		/** Today in the settings timezone, `YYYY-MM-DD`. */
		today: string;
		goal?: Goal | null;
	};

	let { series, today, goal = null }: Props = $props();

	const STORAGE_KEY = 'kcal-weight-range';
	const DEFAULT_RANGE: RangeKey = '90';
	const HEIGHT = 224;
	const MARGIN = { top: 12, right: 12, bottom: 28, left: 44 };
	const PAD_KG = 0.5;
	const FALLBACK_WIDTH = 320;
	const DENSE_POINTS = 120;

	const uid = $props.id();
	const hintId = `${uid}-hint`;
	const clipId = `${uid}-clip`;

	let range = $state<RangeKey>(DEFAULT_RANGE);
	let clientWidth = $state(0);
	let svg = $state<SVGSVGElement>();
	let plot = $state<HTMLElement>();
	let tooltipWidth = $state(0);
	let activeIndex = $state<number | null>(null);

	// Read after mount, so the server and the first client render agree.
	onMount(() => {
		try {
			range = parseRange(localStorage.getItem(STORAGE_KEY)) ?? DEFAULT_RANGE;
		} catch {
			// storage unavailable (private mode, blocked): the default range applies
		}
	});

	function chooseRange(next: RangeKey) {
		range = next;
		activeIndex = null;
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// storage unavailable: the range applies for this page view only
		}
	}

	const rangeOption = $derived(RANGES.find((option) => option.key === range) ?? RANGES[1]);
	const visible = $derived(visiblePoints(series, today, rangeOption.days));

	const width = $derived(clientWidth || FALLBACK_WIDTH);
	const startDate = $derived(
		rangeOption.days === null
			? (visible[0]?.date ?? today)
			: addDays(today, -(rangeOption.days - 1))
	);
	const endDate = $derived.by(() => {
		const last = visible.at(-1)?.date;
		return last !== undefined && last > today ? last : today;
	});
	const spanDays = $derived(daysBetween(startDate, endDate));

	const xScale = $derived(scale({ min: 0, max: spanDays }, [MARGIN.left, width - MARGIN.right]));
	const xOf = (date: string) => xScale(daysBetween(startDate, date));
	const domain = $derived(yDomain(visible, PAD_KG));
	const yScale = $derived(
		domain ? scale(domain, [HEIGHT - MARGIN.bottom, MARGIN.top]) : (value: number) => value
	);

	const dots = $derived(
		visible.map((point) => ({ point, x: xOf(point.date), y: yScale(point.kg) }))
	);
	const trendPath = $derived(
		linePath(visible.map((point) => ({ x: xOf(point.date), y: yScale(point.trend) })))
	);
	const yTicks = $derived(domain ? niceTicks(domain, 5) : []);
	const xTicks = $derived.by(() => {
		const days = spanDays === 0 ? [0] : [0, 1, 2, 3].map((i) => Math.round((spanDays * i) / 3));
		return [...new Set(days)].map((day, index, all) => ({
			x: xScale(day),
			label: formatTick(addDays(startDate, day), spanDays),
			anchor:
				all.length === 1 || (index > 0 && index < all.length - 1)
					? ('middle' as const)
					: index === 0
						? ('start' as const)
						: ('end' as const)
		}));
	});
	const goalSegment = $derived.by(() => {
		const line = goal ? goalLine(goal, { start: startDate, end: endDate }) : null;
		return line
			? {
					x1: xOf(line.start.date),
					y1: yScale(line.start.kg),
					x2: xOf(line.end.date),
					y2: yScale(line.end.kg)
				}
			: null;
	});

	const describe = (point: TrendPoint) =>
		`${formatDay(point.date, { year: true })}, ${formatKg(point.kg)} kg, trend ${formatKg(point.trend)} kg`;

	// An empty chart has no picked point. Without this a refilled series would show the old pick: a focused slider that
	// goes away does not always blur (iOS Safari), so nothing else clears it.
	$effect(() => {
		if (visible.length === 0) activeIndex = null;
	});

	// The picked point, kept inside the series: it can shrink under the focus (a delete while the chart is focused).
	const lastIndex = $derived(dots.length - 1);
	const index = $derived(activeIndex === null ? null : Math.min(activeIndex, lastIndex));
	const active = $derived(index === null ? undefined : dots[index]);
	// What the slider reports: the picked point, else the latest.
	const current = $derived(active ?? dots.at(-1));
	const tooltipLeft = $derived(
		active
			? Math.min(
					Math.max(active.x, tooltipWidth / 2),
					Math.max(tooltipWidth / 2, width - tooltipWidth / 2)
				)
			: 0
	);

	function select(clientX: number) {
		if (!svg) return;
		const index = nearestIndex(
			dots.map((dot) => dot.x),
			clientX - svg.getBoundingClientRect().left
		);
		activeIndex = index < 0 ? null : index;
	}

	function onkeydown(event: KeyboardEvent) {
		if (lastIndex < 0) return;
		const at = index ?? lastIndex;
		let next: number | null;
		switch (event.key) {
			// Up is next and down is previous, as on a slider.
			case 'ArrowLeft':
			case 'ArrowDown':
				next = Math.max(0, at - 1);
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				next = at + 1; // past the end is clamped by `index`
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = lastIndex;
				break;
			case 'Escape':
				next = null;
				break;
			default:
				return;
		}
		event.preventDefault();
		activeIndex = next;
	}
</script>

<!-- A touch outside the chart puts its tooltip away (a tap on the chart picks a point, the keys and Escape move or close). -->
<svelte:window
	onpointerdown={(event) => {
		if (activeIndex !== null && plot && !plot.contains(event.target as Node)) activeIndex = null;
	}}
/>

<Card class="flex flex-col gap-3">
	{#if series.length === 0}
		<p class="py-10 text-center text-base text-text-muted">
			Your chart starts with the first weigh-in.
		</p>
	{:else}
		<SegmentedControl
			label="Range"
			options={RANGES.map(({ key, label }) => ({ value: key, label }))}
			bind:value={() => range, chooseRange}
			class="w-full"
		/>
		{#if visible.length === 0}
			<p class="py-10 text-center text-base text-text-muted">No weigh-ins in this range</p>
		{:else}
			<!-- A scrubber over the points: tap, drag, hover and the arrow keys pick one; the table below is the text version. -->
			<div
				role="slider"
				aria-label="Weight chart"
				aria-describedby={hintId}
				aria-orientation="horizontal"
				aria-valuemin={0}
				aria-valuemax={lastIndex}
				aria-valuenow={index ?? lastIndex}
				aria-valuetext={current ? describe(current.point) : undefined}
				tabindex="0"
				class="touch-pan-y rounded-md select-none"
				bind:this={plot}
				bind:clientWidth
				onpointerdown={(event) => select(event.clientX)}
				onpointermove={(event) => {
					if (event.pointerType === 'mouse' || event.buttons) select(event.clientX);
				}}
				onpointerleave={(event) => {
					// Keyboard focus keeps its pick: the mouse leaving does not move the slider.
					if (event.pointerType === 'mouse' && document.activeElement !== plot) activeIndex = null;
				}}
				onfocus={() => (activeIndex ??= lastIndex)}
				onblur={() => (activeIndex = null)}
				{onkeydown}
			>
				<!--
					Seen only: the slider's value text tells assistive technology the same. In the flow above the plot, so a
					larger text size makes the row taller instead of covering data; at least 5rem (the box is about 4rem), so showing it moves nothing.
				-->
				<div data-testid="tooltip" aria-hidden="true" class="pointer-events-none mb-2 min-h-20">
					{#if active}
						<div
							class="relative flex w-max max-w-full -translate-x-1/2 flex-col rounded-md border border-border bg-surface-raised px-3 py-1 shadow-md"
							style:left="{tooltipLeft}px"
							bind:clientWidth={tooltipWidth}
						>
							<span class="text-sm text-text-muted">{formatDay(active.point.date)}</span>
							<span class="text-base font-medium text-text tabular-nums">
								{formatKg(active.point.kg)} kg
							</span>
							<span class="text-sm text-text-muted tabular-nums">
								Trend {formatKg(active.point.trend)} kg
							</span>
						</div>
					{/if}
				</div>
				<svg bind:this={svg} {width} height={HEIGHT} aria-hidden="true" class="block">
					<defs>
						<clipPath id={clipId}>
							<rect
								x={MARGIN.left}
								y={MARGIN.top}
								width={Math.max(0, width - MARGIN.left - MARGIN.right)}
								height={HEIGHT - MARGIN.top - MARGIN.bottom}
							/>
						</clipPath>
					</defs>
					{#each yTicks as tick (tick)}
						<line
							x1={MARGIN.left}
							x2={width - MARGIN.right}
							y1={yScale(tick)}
							y2={yScale(tick)}
							class="stroke-border"
						/>
						<text
							x={MARGIN.left - 8}
							y={yScale(tick)}
							dy="0.32em"
							text-anchor="end"
							class="fill-text-muted text-xs tabular-nums"
						>
							{formatKg(tick)}
						</text>
					{/each}
					{#each xTicks as tick (tick.x)}
						<text
							x={tick.x}
							y={HEIGHT - 8}
							text-anchor={tick.anchor}
							class="fill-text-muted text-xs tabular-nums"
						>
							{tick.label}
						</text>
					{/each}
					{#if goalSegment}
						<line
							data-testid="goal-line"
							clip-path="url(#{clipId})"
							x1={goalSegment.x1}
							y1={goalSegment.y1}
							x2={goalSegment.x2}
							y2={goalSegment.y2}
							stroke-width="2"
							stroke-dasharray="6 4"
							class="stroke-success"
						/>
					{/if}
					{#if active}
						<line
							x1={active.x}
							x2={active.x}
							y1={MARGIN.top}
							y2={HEIGHT - MARGIN.bottom}
							class="stroke-border-strong"
						/>
					{/if}
					<path
						d={trendPath}
						fill="none"
						stroke-width="2"
						stroke-linejoin="round"
						stroke-linecap="round"
						class="stroke-brand"
					/>
					{#each dots as dot (dot.point.date)}
						<circle
							data-dot
							cx={dot.x}
							cy={dot.y}
							r={dots.length > DENSE_POINTS ? 1.5 : 3}
							class="fill-text-muted"
						/>
					{/each}
					{#if active}
						<circle
							cx={active.x}
							cy={active.y}
							r="5"
							stroke-width="2"
							class="fill-surface stroke-brand"
						/>
					{/if}
				</svg>
			</div>
			<p id={hintId} class="text-sm text-text-muted">
				Tap, drag or hover the chart, or use the arrow keys, to read a weigh-in. Dots are weigh-ins,
				the line is the trend.
			</p>
			<table class="sr-only">
				<caption>Weigh-ins, {rangeOption.label.toLowerCase()}</caption>
				<thead>
					<tr><th scope="col">Date</th><th scope="col">Weight</th><th scope="col">Trend</th></tr>
				</thead>
				<tbody>
					{#each visible as point (point.date)}
						<tr>
							<th scope="row">{formatDay(point.date, { year: true })}</th>
							<td>{formatKg(point.kg)} kg</td>
							<td>{formatKg(point.trend)} kg</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</Card>
