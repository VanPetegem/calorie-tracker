<script lang="ts">
	import { Badge } from '#lib/components/ui/index.ts';

	/**
	 * How a week's TDEE was set: the formula, or the adaptive estimate with its valid days. `adaptive` is the week's
	 * `tdee_adaptive`, null when the gate failed and the formula was used.
	 */
	type Props = {
		adaptive: number | null;
		validDays: number;
	};

	let { adaptive, validDays }: Props = $props();
</script>

<Badge tone={adaptive === null ? 'neutral' : 'brand'}>
	{adaptive === null ? 'Formula' : `Adaptive, ${validDays} valid days`}
</Badge>
