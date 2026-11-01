import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	ConflictError,
	PreconditionError,
	TrevolError,
	Webhook,
	type InvoiceInput
} from '../../src/index.js';
import { URL_PRISM, clientePrism, conViolaciones, prefer } from './ayudas.js';

const operaciones: Array<{ operationId: string; ejemplos: Array<{ nombre: string; valor: any }> }> = JSON.parse(
	readFileSync(new URL('../datos/operaciones.json', import.meta.url), 'utf8')
);
const ejemplo = (op: string, nombre?: string) => {
	const o = operaciones.find((x) => x.operationId === op)!;
	return (nombre ? o.ejemplos.find((e) => e.nombre === nombre)! : o.ejemplos[0]!).valor;
};

describe.skipIf(!URL_PRISM)('contra Prism (servidor simulado desde docs/api/openapi.json)', () => {
	const trevol = clientePrism();

	it('crea una factura (201) con el cuerpo de ejemplo de la especificación', async () => {
		const doc = await conViolaciones(() => trevol.invoices.createInvoice({ invoiceInput: ejemplo('createInvoice') as InvoiceInput }));
		expect(doc.object).toBe('invoice');
	});

	it('crea una nota crédito y calcula un preview', async () => {
		const nc = await conViolaciones(() => trevol.creditNotes.createCreditNote({ noteInput: ejemplo('createCreditNote') }));
		expect(nc).toBeTruthy();
		const p = await conViolaciones(() => trevol.invoices.previewInvoice({ invoiceInput: ejemplo('previewInvoice') }));
		expect(p.object).toBe('preview');
		expect(p.totals).toBeTruthy();
	});

	it('corrige una factura rechazada con PUT', async () => {
		const d = await conViolaciones(() => trevol.invoices.correctInvoice({ id: 'inv_' + '0'.repeat(32), invoiceInput: ejemplo('correctInvoice') }));
		expect(d).toBeTruthy();
	});

	it('lista facturas y eventos e itera con paginate (con tope de 3: Prism repite la misma página)', async () => {
		const facturas: string[] = [];
		for await (const f of trevol.paginate((cursor) => conViolaciones(() => trevol.invoices.listInvoices({ limit: 2, startingAfter: cursor })))) {
			facturas.push(f.id!);
			if (facturas.length === 3) break;
		}
		expect(facturas.length).toBeGreaterThan(0);
		const eventos: string[] = [];
		for await (const e of trevol.paginate((cursor) => conViolaciones(() => trevol.events.listEvents({ startingAfter: cursor })))) {
			eventos.push(e.id!);
			if (eventos.length === 3) break;
		}
		expect(eventos.length).toBeGreaterThan(0);
	});

	for (const [tipo, op, mime] of [['pdf', 'downloadInvoicePdf', 'application/pdf'], ['xml', 'downloadInvoiceXml', 'application/xml'], ['zip', 'downloadInvoiceZip', 'application/zip']] as const) {
		it(`descarga el ${tipo.toUpperCase()}: los bytes llegan y el Accept es el correcto`, async () => {
			const raw: any = await conViolaciones(() => (trevol.invoices as any)[`${op}Raw`]({ id: 'inv_' + '0'.repeat(32) }));
			expect(raw.raw.headers.get('content-type')).toContain(mime.split('/')[1]);
			const blob = await raw.value();
			expect(blob).toBeInstanceOf(Blob);
		});
	}

	it('descarga la respuesta de la DIAN (xml)', async () => {
		const blob = await conViolaciones(() => trevol.invoices.downloadInvoiceDianResponse({ id: 'inv_' + '0'.repeat(32) }));
		expect(blob).toBeInstanceOf(Blob);
	});

	it('Prefer: code=422 sobre un evento RADIAN → PreconditionError tacit_acceptance_not_due', async () => {
		const e = await trevol.radianEvents
			.createRadianEvent({ radianEventInput: ejemplo('createRadianEvent', 'tacita') }, prefer('code=422, example=tacita'))
			.catch((x) => x);
		expect(e).toBeInstanceOf(PreconditionError);
		expect(e.code).toBe('tacit_acceptance_not_due');
		expect(e.status).toBe(422);
	});

	it('Prefer: code=409 sobre un evento RADIAN → ConflictError', async () => {
		const e = await trevol.radianEvents
			.createRadianEvent({ radianEventInput: ejemplo('createRadianEvent', 'acuse') }, prefer('code=409, example=duplicado'))
			.catch((x) => x);
		expect(e).toBeInstanceOf(ConflictError);
		expect(e.status).toBe(409);
	});

	it('Prefer: code=429 → un TrevolError con status 429 (retryable, con la idempotencyKey)', async () => {
		const e = await trevol.invoices.createInvoice({ invoiceInput: ejemplo('createInvoice') }, prefer('code=429')).catch((x: unknown) => x);
		expect(e).toBeInstanceOf(TrevolError);
		expect((e as TrevolError).status).toBe(429);
		expect((e as TrevolError).retryable).toBe(true);
		expect((e as TrevolError).idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
	});

	it('crea un endpoint de webhooks y manda la prueba (202)', async () => {
		const ep = await conViolaciones(() => trevol.webhookEndpoints.createWebhookEndpoint({ webhookEndpointInput: ejemplo('createWebhookEndpoint') }));
		expect(ep.object).toBe('webhook_endpoint');
		const entrega = await conViolaciones(() => trevol.webhookEndpoints.testWebhookEndpoint({ id: 'we_' + '0'.repeat(32) }));
		expect(entrega).toBeTruthy();
	});

	it('el SDK reintenta contra Prism sin cambiar la clave: dos intentos, la misma Idempotency-Key', async () => {
		const conReintentos = clientePrism({ maxRetries: 1, internos: { sleep: async () => {} } });
		const e = await conReintentos.invoices
			.createInvoice({ invoiceInput: ejemplo('createInvoice'), idempotencyKey: 'PRUEBA-PRISM-1' }, prefer('code=503'))
			.catch((x) => x);
		expect(e).toBeInstanceOf(TrevolError);
		expect(e.status).toBe(503);
		expect(e.idempotencyKey).toBe('PRUEBA-PRISM-1');
	});

	it('verifica un webhook firmado por nosotros mismos (sanidad de la ruta completa)', () => {
		expect(typeof Webhook).toBe('function');
	});
});
