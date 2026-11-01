import { describe, expect, it } from 'vitest';
import { APIConnectionError, ConflictError, DianUnavailableError, RateLimitError, ValidationError } from '../src/index.js';
import { DOCUMENTO, ENTRADA_FACTURA, cliente, json, problema } from './ayudas.js';

describe('reintentos a través de un método generado', () => {
	it('reintenta un 503 dian_unavailable y devuelve el 201', async () => {
		const { trevol, peticiones, esperas } = cliente([problema(503, 'dian_unavailable', { retryable: true }), json(201, DOCUMENTO)]);
		const doc = await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA });
		expect(doc.id).toBe(DOCUMENTO.id);
		expect(peticiones).toHaveLength(2);
		expect(esperas).toEqual([0.5]);
	});

	it('un 202 processing es un resultado: no se reintenta y no es error', async () => {
		const { trevol, peticiones } = cliente([json(202, { ...DOCUMENTO, status: 'processing' }, { 'retry-after': '30', location: '/v1/invoices/x' })]);
		const doc = await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA });
		expect(doc.status).toBe('processing');
		expect(peticiones).toHaveLength(1);
	});

	it('respeta Retry-After en un 409 request_in_progress', async () => {
		const { trevol, esperas } = cliente([problema(409, 'request_in_progress', { retryable: true }, { 'retry-after': '30' }), json(201, DOCUMENTO)]);
		await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA });
		expect(esperas).toEqual([30]);
	});

	it('un 409 invalid_state es final: lanza ConflictError sin reintentar', async () => {
		const { trevol, peticiones } = cliente([problema(409, 'invalid_state')]);
		await expect(trevol.invoices.sendInvoice({ id: 'inv_x' })).rejects.toBeInstanceOf(ConflictError);
		expect(peticiones).toHaveLength(1);
	});

	it('un Retry-After mayor que maxRetryAfter no espera: lanza RateLimitError con retryAfter', async () => {
		const { trevol, peticiones, esperas } = cliente([problema(429, 'rate_limited', { retryable: true }, { 'retry-after': '120' })]);
		const e = await trevol.invoices.listInvoices({}).catch((x) => x);
		expect(e).toBeInstanceOf(RateLimitError);
		expect(e.retryAfter).toBe(120);
		expect(peticiones).toHaveLength(1);
		expect(esperas).toEqual([]);
	});

	it('agota los reintentos y lanza el error de la última respuesta', async () => {
		const { trevol, peticiones, esperas } = cliente([problema(503, 'dian_unavailable', { retryable: true })]);
		await expect(trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA })).rejects.toBeInstanceOf(DianUnavailableError);
		expect(peticiones).toHaveLength(3);
		expect(esperas).toEqual([0.5, 1]);
	});

	it('maxRetries: 0 los apaga', async () => {
		const { trevol, peticiones } = cliente([problema(503, 'dian_unavailable', { retryable: true })], { maxRetries: 0 });
		await expect(trevol.invoices.listInvoices({})).rejects.toBeInstanceOf(DianUnavailableError);
		expect(peticiones).toHaveLength(1);
	});

	it('un error de red en POST /invoices (con clave) se reintenta; agotado es APIConnectionError con la idempotencyKey', async () => {
		const { trevol, peticiones } = cliente([new TypeError('fetch failed')]);
		const e = await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA }).catch((x) => x);
		expect(e).toBeInstanceOf(APIConnectionError);
		expect(e.idempotencyKey).toBe('00000000-0000-4000-8000-000000000001');
		expect(peticiones).toHaveLength(3);
		expect(String(e)).not.toContain('tvl_');
	});

	it('un error de red en POST /webhook_endpoints (sin clave) NO se reintenta', async () => {
		const { trevol, peticiones } = cliente([new TypeError('fetch failed')]);
		await expect(trevol.webhookEndpoints.createWebhookEndpoint({ webhookEndpointInput: { url: 'https://tu-servidor.co/h', events: ['*'] } as any })).rejects.toBeInstanceOf(APIConnectionError);
		expect(peticiones).toHaveLength(1);
	});

	it('un 429 en una operación solo_429 (crear un endpoint) sí se reintenta; un 503 no', async () => {
		const a = cliente([problema(429, 'rate_limited', { retryable: true }, { 'retry-after': '2' }), json(201, { id: 'we_x' })]);
		await a.trevol.webhookEndpoints.createWebhookEndpoint({ webhookEndpointInput: { url: 'https://tu-servidor.co/h', events: ['*'] } as any });
		expect(a.peticiones).toHaveLength(2);
		const b = cliente([problema(503, 'dian_unavailable', { retryable: true })]);
		await expect(b.trevol.webhookEndpoints.createWebhookEndpoint({ webhookEndpointInput: { url: 'https://tu-servidor.co/h', events: ['*'] } as any })).rejects.toBeInstanceOf(DianUnavailableError);
		expect(b.peticiones).toHaveLength(1);
	});

	it('un 422 no se reintenta', async () => {
		const { trevol, peticiones } = cliente([problema(422, 'validation_error')]);
		await expect(trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA })).rejects.toBeInstanceOf(ValidationError);
		expect(peticiones).toHaveLength(1);
	});

	it('la cancelación de la persona no se reintenta ni se disfraza', async () => {
		const ctl = new AbortController();
		const { trevol, peticiones } = cliente([() => new DOMException('abortada', 'AbortError')]);
		ctl.abort();
		await expect(trevol.invoices.listInvoices({}, { signal: ctl.signal })).rejects.toBeTruthy();
		expect(peticiones.length).toBeLessThanOrEqual(1);
	});
});
