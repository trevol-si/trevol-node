// Prueba de humo REAL en habilitación (docs/api/43 §2.10.4). NO es parte de la suite: la corre una persona, con una llave de PRUEBAS.
//
//   TREVOL_API_KEY=tvl_test_… npm run humo                    # solo lecturas y un preview
//   TREVOL_API_KEY=tvl_test_… TREVOL_HUMO_EMITIR=1 npm run humo   # además EMITE una factura en habilitación (la repite con la misma clave,
//                                                                 # espera la entrega y descarga el PDF y el XML)
//
// Se NIEGA a correr si la llave no es tvl_test_. `TREVOL_BASE_URL` (opcional) apunta a otro servidor, p. ej. un Prism local.
import { createHmac } from 'node:crypto';
import { NotFoundError, Trevol, Webhook } from '../../dist/index.js';

const llave = process.env.TREVOL_API_KEY ?? '';
if (!/^tvl_test_[0-9a-f]{64}$/.test(llave)) {
	console.error('humo: me niego a correr si TREVOL_API_KEY no es una llave de PRUEBAS (tvl_test_…). Nunca se prueba con tvl_live_.');
	process.exit(2);
}
const trevol = new Trevol(llave, { environment: 'test', baseUrl: process.env.TREVOL_BASE_URL ?? undefined });
const pasos = [];
const paso = async (nombre, f) => {
	try {
		const detalle = await f();
		pasos.push([nombre, true, detalle ?? '']);
		console.log(`ok   ${nombre}${detalle ? ` — ${detalle}` : ''}`);
	} catch (e) {
		pasos.push([nombre, false, String(e)]);
		console.log(`FALLA ${nombre} — ${e}`);
	}
};

await paso('getHealth', async () => void (await trevol.general.getHealth()));
await paso('retrieveCompany', async () => {
	const c = await trevol.general.retrieveCompany();
	if (c.environment !== 'test') throw new Error(`la empresa dice environment=${c.environment}`);
	return `${c.name ?? ''} (${c.nit ?? ''})`;
});
await paso('previewInvoice', async () => {
	const p = await trevol.invoices.previewInvoice({ invoiceInput: facturaDeHumo('HUMO-PREVIEW') });
	return `total ${p.totals?.total ?? '?'}`;
});
await paso('listInvoices + paginate (3)', async () => {
	await trevol.invoices.listInvoices({ limit: 3 });
	let n = 0;
	for await (const _ of trevol.paginate((cursor) => trevol.invoices.listInvoices({ limit: 3, startingAfter: cursor }))) if (++n === 3) break;
	return `${n} facturas`;
});
await paso('retrieveInvoice inexistente → NotFoundError con requestId', async () => {
	try {
		await trevol.invoices.retrieveInvoice({ id: 'inv_' + '0'.repeat(32) });
	} catch (e) {
		if (e instanceof NotFoundError && e.requestId?.startsWith('req_')) return e.requestId;
		throw e;
	}
	throw new Error('no lanzó NotFoundError');
});
await paso('Webhook.verify (firmado ahora, con un secreto local)', async () => {
	const clave = Buffer.from('trevol-humo-secreto-de-32-bytes!');
	const cuerpo = JSON.stringify({ id: 'evt_' + '1'.repeat(32), object: 'event', type: 'webhook.test', timestamp: new Date().toISOString(), environment: 'test', api_version: '2026-10-22', data: {} });
	const ts = Math.floor(Date.now() / 1000);
	const firma = 'v1,' + createHmac('sha256', clave).update(`evt_${'1'.repeat(32)}.${ts}.${cuerpo}`).digest('base64');
	const e = new Webhook('whsec_' + clave.toString('base64')).verify(cuerpo, { 'webhook-id': 'evt_' + '1'.repeat(32), 'webhook-timestamp': String(ts), 'webhook-signature': firma });
	return e.type;
});

if (process.env.TREVOL_HUMO_EMITIR === '1') {
	const clave = `humo-${Date.now()}`;
	let creada;
	await paso('createInvoice (EMITE en habilitación)', async () => {
		creada = await trevol.invoices.createInvoice({ invoiceInput: facturaDeHumo(`HUMO-${Date.now()}`), idempotencyKey: clave });
		return `${creada.id} ${creada.status}`;
	});
	await paso('la misma llamada con la misma Idempotency-Key devuelve lo mismo (Idempotent-Replayed: true)', async () => {
		const raw = await trevol.invoices.createInvoiceRaw({ invoiceInput: facturaDeHumo(`HUMO-${Date.now()}`), idempotencyKey: clave });
		const otra = await raw.value();
		if (raw.raw.headers.get('idempotent-replayed') !== 'true') throw new Error('falta Idempotent-Replayed: true');
		if (otra.id !== creada?.id) throw new Error(`otro id: ${otra.id}`);
	});
	if (creada) {
		await paso('espera delivery.status = completed (hasta 60 s)', async () => {
			const limite = Date.now() + 60_000;
			for (;;) {
				const d = await trevol.invoices.retrieveInvoice({ id: creada.id });
				if (d.delivery?.status === 'completed') return 'completed';
				if (Date.now() > limite) throw new Error(`delivery.status = ${d.delivery?.status}`);
				await new Promise((r) => setTimeout(r, 3000));
			}
		});
		await paso('descarga el PDF y el XML', async () => {
			const pdf = await trevol.invoices.downloadInvoicePdf({ id: creada.id });
			const xml = await trevol.invoices.downloadInvoiceXml({ id: creada.id });
			return `PDF ${pdf.size} bytes, XML ${xml.size} bytes`;
		});
	}
} else {
	console.log('(no se emite nada: define TREVOL_HUMO_EMITIR=1 para emitir una factura en habilitación)');
}

const fallas = pasos.filter(([, ok]) => !ok);
console.log(`\n${pasos.length - fallas.length}/${pasos.length} pasos bien`);
process.exit(fallas.length ? 1 : 0);

function facturaDeHumo(externo) {
	return {
		external_id: externo,
		customer: { final_consumer: true },
		items: [{ description: 'Prueba de humo del SDK de Trevol', quantity: '1', unit_price: '1000', taxes: [{ code: '01', rate: '19' }] }],
		payment: { form: 'cash', methods: [{ code: '10' }] }
	};
}
