import Anthropic from '@anthropic-ai/sdk';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLabelReader, LABEL_MODEL, type LabelClient } from './read.ts';

const DATA_URI = 'data:image/jpeg;base64,QUJD';

const answer = {
	found: true,
	basis: 'g',
	kcal: 520,
	protein: 6.5,
	carbs: 58,
	fat: 30,
	fiber: null,
	servingG: 25
};

function reply(overrides: Partial<BetaMessage> = {}): BetaMessage {
	return {
		content: [
			{ type: 'thinking', thinking: 'reading the table', signature: 'sig' },
			{ type: 'text', text: JSON.stringify(answer), citations: null }
		],
		stop_reason: 'end_turn',
		...overrides
	} as BetaMessage;
}

function setup(respond: () => Promise<BetaMessage> = async () => reply(), allowed = true) {
	const create = vi.fn<LabelClient['beta']['messages']['create']>(respond);
	const limit = vi.fn(async () => ({ success: allowed }));
	const log = vi.spyOn(console, 'error').mockImplementation(() => {});
	const reader = createLabelReader({
		client: { beta: { messages: { create } } },
		limiter: { limit }
	});
	return { reader, create, limit, log };
}

afterEach(() => vi.restoreAllMocks());

describe('label reader', () => {
	it('sends the photo, the pinned model, medium effort and the JSON schema, and returns normalized values', async () => {
		const { reader, create, limit } = setup();
		expect(await reader.read(DATA_URI)).toEqual({
			ok: true,
			values: {
				nutritionBasis: 'g',
				kcal: 520,
				protein: 6.5,
				carbs: 58,
				fat: 30,
				fiber: null,
				servingG: 25
			}
		});
		expect(limit).toHaveBeenCalledWith({ key: 'label' });
		const params = create.mock.calls[0][0];
		expect(params.model).toBe(LABEL_MODEL);
		expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
		expect(params.fallbacks).toBe('default');
		expect(params.output_config).toMatchObject({
			effort: 'medium',
			format: { type: 'json_schema', schema: { additionalProperties: false } }
		});
		expect(params.messages[0].content).toMatchObject([
			{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'QUJD' } },
			{ type: 'text' }
		]);
	});

	it('answers rate_limited without calling the API when the limiter refuses', async () => {
		const { reader, create } = setup(async () => reply(), false);
		expect(await reader.read(DATA_URI)).toEqual({ ok: false, reason: 'rate_limited' });
		expect(create).not.toHaveBeenCalled();
	});

	it.each([
		[
			'malformed JSON',
			reply({ content: [{ type: 'text', text: '{"found": tr', citations: null }] }),
			{ branch: 'bad_json' }
		],
		['an empty answer', reply({ content: [] }), { branch: 'no_text' }],
		[
			'a number sent as text',
			reply({
				content: [
					{ type: 'text', text: JSON.stringify({ ...answer, kcal: '520' }), citations: null }
				]
			}),
			{ branch: 'bad_shape' }
		],
		[
			'no label found',
			reply({
				content: [
					{
						type: 'text',
						text: JSON.stringify({ ...answer, found: false, kcal: null }),
						citations: null
					}
				]
			}),
			{ branch: 'not_found' }
		],
		[
			'a refusal',
			reply({
				stop_reason: 'refusal',
				stop_details: { type: 'refusal', category: 'cyber' } as never
			}),
			{ branch: 'refusal', category: 'cyber' }
		],
		[
			'a cut off answer',
			reply({ stop_reason: 'max_tokens' }),
			{ branch: 'max_tokens', category: null }
		]
	])('answers unreadable for %s and logs only the branch', async (_name, message, detail) => {
		const { reader, log } = setup(async () => message);
		expect(await reader.read(DATA_URI)).toEqual({ ok: false, reason: 'unreadable' });
		expect(log.mock.calls).toEqual([['label unreadable', detail]]);
	});

	it('answers unavailable on an API error and logs name, status and request id, never the photo', async () => {
		const { reader, log } = setup(async () => {
			throw new Anthropic.APIError(
				529,
				undefined,
				'overloaded QUJD',
				new Headers({ 'request-id': 'req_123' })
			);
		});
		expect(await reader.read(DATA_URI)).toEqual({ ok: false, reason: 'unavailable' });
		expect(log.mock.calls).toEqual([
			['label read failed', { name: 'APIError', status: 529, requestID: 'req_123' }]
		]);
	});
});
