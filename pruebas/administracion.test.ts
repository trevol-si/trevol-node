// La llave de administración (tva_…): formato, entorno, empresa (company / withCompany), las cabeceras Trevol-Company y
// Trevol-Environment, el recurso account con su paginación y que la llave no aparezca en ningún lado (docs/api/35 §18).
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APIConnectionError, ConfigurationError, ConflictError, DianUnavailableError, PermissionDeniedError, RateLimitError, Trevol } from '../src/index.js';
import { OPERACIONES } from '../src/generado/tablas.js';
import { aplicarLlave } from '../src/transporte.js';
import {
	DOCUMENTO,
	EMPRESA,
	LLAVE_ADMIN_LIVE,
	LLAVE_ADMIN_TEST,
	LLAVE_LIVE,
	LLAVE_TEST,
	OTRA_EMPRESA,
	cliente,
	json,
	problema
} from './ayudas.js';

const EMPRESA_CUENTA = {
	id: EMPRESA,
	object: 'company',
	nit: '900373427',
	check_digit: '6',
	name: 'DISTRIBUIDORA LOS ANDES SAS',
	trade_name: null,
	status: 'enabled',
	onboarding: { step: 'done', stop_reason: null },
	emission_environment: 'live',
	created_at: '2026-11-01T10:00:00-05:00',
	enabled_at: '2026-11-02T10:00:00-05:00',
	onboarding_url: 'https://app.trevol.si/empresas/3f0c9a1e-5b2d-4c7f-8a6e-1d2c3b4a5f60',
	api_keys: { active_test: 1, active_live: 0 }
};
const lista = (data: unknown[], has_more: boolean, next_cursor: string | null) => json(200, { object: 'list', data, has_more, next_cursor });
const nunca = (() => {
	throw new Error('no debe llamar');
}) as never;

/** Todo lo que un cliente puede mostrar de sí mismo. */
const mostrado = (t: Trevol) => [JSON.stringify(t), inspect(t, { depth: 6, showHidden: true }), String(t)].join('\n');

describe('la llave de administración: formato, tipo y entorno', () => {
	afterEach(() => vi.unstubAllEnvs());

	it('tva_test_ → test y tva_live_ → live, con keyType account; tvl_ es api', () => {
		expect(new Trevol(LLAVE_ADMIN_TEST)).toMatchObject({ environment: 'test', keyType: 'account', company: null });
		expect(new Trevol(LLAVE_ADMIN_LIVE)).toMatchObject({ environment: 'live', keyType: 'account', company: null });
		expect(new Trevol(LLAVE_TEST)).toMatchObject({ environment: 'test', keyType: 'api', company: null });
		expect(new Trevol(LLAVE_LIVE)).toMatchObject({ environment: 'live', keyType: 'api', company: null });
	});

	it('lee una tva_ de TREVOL_API_KEY y le quita los espacios', () => {
		vi.stubEnv('TREVOL_API_KEY', `  ${LLAVE_ADMIN_LIVE}\n`);
		const t = new Trevol();
		expect(t.keyType).toBe('account');
		expect(t.environment).toBe('live');
	});

	it('una tva_ mal formada → ConfigurationError sin red, que nombra los cuatro prefijos y nunca la llave', () => {
		const malas = [
			'tva_test_abc',
			'tva_prod_' + 'c4'.repeat(32),
			'tva_test_' + 'C4'.repeat(32),
			'tva_test_' + 'c4'.repeat(33),
			'tva_live_' + 'zz'.repeat(32),
			'tvx_test_' + 'c4'.repeat(32),
			'TVA_test_' + 'c4'.repeat(32)
		];
		for (const k of malas) {
			let e: unknown;
			try {
				new Trevol(k, { fetch: nunca });
			} catch (x) {
				e = x;
			}
			expect(e, k).toBeInstanceOf(ConfigurationError);
			const texto = `${(e as Error).message}\n${String(e)}\n${JSON.stringify(e)}\n${inspect(e)}`;
			expect(texto).not.toContain(k);
			expect(texto).not.toContain('c4'.repeat(32));
			expect((e as Error).message).toContain('tvl_test_…, tvl_live_…, tva_test_… o tva_live_…');
			expect((e as Error).message).toContain('https://platform.trevol.si/llaves y la de administración en https://platform.trevol.si/administracion');
		}
	});

	it('environment es solo una aserción: si no coincide con la tva_, error que habla de tva_', () => {
		expect(new Trevol(LLAVE_ADMIN_TEST, { environment: 'test' }).environment).toBe('test');
		expect(() => new Trevol(LLAVE_ADMIN_TEST, { environment: 'live' })).toThrow(/tva_test_ = habilitación/);
		expect(() => new Trevol(LLAVE_ADMIN_LIVE, { environment: 'test' })).toThrow(/tva_live_ = producción/);
		expect(() => new Trevol(LLAVE_LIVE, { environment: 'test' })).toThrow(/tvl_live_ = producción/);
	});
});

describe('la empresa: company y withCompany', () => {
	it('company se valida al crear el cliente (com_ + 32 hex en minúscula) y se le quitan los espacios', () => {
		expect(new Trevol(LLAVE_ADMIN_TEST, { company: EMPRESA }).company).toBe(EMPRESA);
		expect(new Trevol(LLAVE_ADMIN_TEST, { company: `  ${EMPRESA} ` }).company).toBe(EMPRESA);
		for (const mala of ['', 'com_3f0c', EMPRESA.toUpperCase(), 'com_' + 'g'.repeat(32), 'inv_' + '0'.repeat(32), EMPRESA + '0', 3 as never]) {
			expect(() => new Trevol(LLAVE_ADMIN_TEST, { company: mala, fetch: nunca }), String(mala)).toThrow(ConfigurationError);
		}
	});

	it('con una tvl_, company o withCompany → ConfigurationError (una tvl_ ya es de una empresa)', () => {
		expect(() => new Trevol(LLAVE_TEST, { company: EMPRESA })).toThrow(ConfigurationError);
		expect(() => new Trevol(LLAVE_TEST, { company: EMPRESA })).toThrow(/solo aplica a una llave de administración/);
		expect(() => new Trevol(LLAVE_LIVE).withCompany(EMPRESA)).toThrow(/una llave tvl_ ya es de una empresa/);
	});

	it('withCompany da otro cliente con esa empresa; el original no cambia; un id mal formado → ConfigurationError', () => {
		const t = new Trevol(LLAVE_ADMIN_LIVE, { company: EMPRESA, apiVersion: '2026-10-22' });
		const otra = t.withCompany(OTRA_EMPRESA);
		expect(otra).not.toBe(t);
		expect(otra).toBeInstanceOf(Trevol);
		expect(otra).toMatchObject({ company: OTRA_EMPRESA, environment: 'live', keyType: 'account', apiVersion: '2026-10-22' });
		expect(t.company).toBe(EMPRESA);
		expect(new Trevol(LLAVE_ADMIN_TEST).withCompany(EMPRESA).company).toBe(EMPRESA);
		expect(() => t.withCompany('com_123')).toThrow(ConfigurationError);
	});
});

describe('Trevol-Company y Trevol-Environment en el transporte', () => {
	it('tva_ + company en una operación de empresa: manda las dos (el entorno sale del prefijo) y la tva_ en Authorization', async () => {
		for (const [llave, entorno] of [[LLAVE_ADMIN_TEST, 'test'], [LLAVE_ADMIN_LIVE, 'live']] as const) {
			const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], { company: EMPRESA }, llave);
			await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id });
			const c = peticiones[0]!.cabeceras;
			expect(c.get('trevol-company')).toBe(EMPRESA);
			expect(c.get('trevol-environment')).toBe(entorno);
			expect(c.get('authorization')).toBe(`Bearer ${llave}`);
		}
	});

	it('tva_ sin empresa en una operación de empresa → ConfigurationError ANTES de la red, sin la llave en el mensaje', async () => {
		const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], {}, LLAVE_ADMIN_TEST);
		const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
		expect(e).toBeInstanceOf(ConfigurationError);
		expect(e.message).toContain("withCompany('com_…')");
		expect(e.message).toContain('retrieveInvoice');
		expect(`${e.message}${String(e)}${inspect(e)}`).not.toContain('c4'.repeat(32));
		expect(peticiones).toHaveLength(0);
		// también una que escribe: no se gasta ni la Idempotency-Key ni un intento
		const e2 = await trevol.invoices.createInvoice({ invoiceInput: { customer: { final_consumer: true }, items: [] } as never }).catch((x) => x);
		expect(e2).toBeInstanceOf(ConfigurationError);
		expect(peticiones).toHaveLength(0);
	});

	it('withCompany manda su empresa en cada petición y comparte el fetch del cliente original', async () => {
		const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], {}, LLAVE_ADMIN_LIVE);
		await trevol.withCompany(EMPRESA).invoices.retrieveInvoice({ id: DOCUMENTO.id });
		await trevol.withCompany(OTRA_EMPRESA).invoices.retrieveInvoice({ id: DOCUMENTO.id });
		expect(peticiones.map((p) => p.cabeceras.get('trevol-company'))).toEqual([EMPRESA, OTRA_EMPRESA]);
		expect(peticiones.map((p) => p.cabeceras.get('trevol-environment'))).toEqual(['live', 'live']);
	});

	it('tva_ en las operaciones de account y en /health: nunca las manda, aunque el cliente tenga empresa o la persona las ponga a mano', async () => {
		const { trevol, peticiones } = cliente([json(200, { object: 'account_key_info' }), json(200, { status: 'ok' })], { company: EMPRESA }, LLAVE_ADMIN_TEST);
		await trevol.account.retrieveAccount(async ({ init }) => ({ headers: { ...init.headers, 'Trevol-Company': OTRA_EMPRESA, 'Trevol-Environment': 'live' } }));
		await trevol.general.getHealth();
		for (const p of peticiones) {
			expect(p.cabeceras.get('trevol-company')).toBeNull();
			expect(p.cabeceras.get('trevol-environment')).toBeNull();
			expect(p.cabeceras.get('authorization')).toBe(`Bearer ${LLAVE_ADMIN_TEST}`);
		}
		expect(peticiones[0]!.url).toBe('https://api.trevol.si/v1/account');
	});

	it('tva_: lo que la persona ponga a mano en una operación de empresa lo reemplaza el del cliente', async () => {
		const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], { company: EMPRESA }, LLAVE_ADMIN_TEST);
		await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }, async ({ init }) => ({
			headers: { ...init.headers, 'Trevol-Company': OTRA_EMPRESA, 'trevol-environment': 'live' }
		}));
		expect(peticiones[0]!.cabeceras.get('trevol-company')).toBe(EMPRESA);
		expect(peticiones[0]!.cabeceras.get('trevol-environment')).toBe('test');
	});

	it('tvl_: nunca las manda, ni aunque la persona las ponga a mano', async () => {
		const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], {}, LLAVE_LIVE);
		await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }, async ({ init }) => ({
			headers: { ...init.headers, 'Trevol-Company': EMPRESA, 'Trevol-Environment': 'live' }
		}));
		await trevol.general.getHealth();
		for (const p of peticiones) {
			expect(p.cabeceras.get('trevol-company')).toBeNull();
			expect(p.cabeceras.get('trevol-environment')).toBeNull();
		}
	});

	it('tvl_ en una operación de account → ConfigurationError antes de la red (las 10)', async () => {
		const { trevol, peticiones } = cliente([json(200, {})], {}, LLAVE_TEST);
		const llamadas: Array<[string, () => Promise<unknown>]> = [
			['retrieveAccount', () => trevol.account.retrieveAccount()],
			['listAccountCompanies', () => trevol.account.listAccountCompanies()],
			['createAccountCompany', () => trevol.account.createAccountCompany({ accountCompanyInput: { nit: '900373427' } })],
			['retrieveAccountCompany', () => trevol.account.retrieveAccountCompany({ id: EMPRESA })],
			['listAccountCompanyApiKeys', () => trevol.account.listAccountCompanyApiKeys({ id: EMPRESA })],
			['createAccountCompanyApiKey', () => trevol.account.createAccountCompanyApiKey({ id: EMPRESA, accountApiKeyInput: { name: 'ERP', permissions: 'read' } })],
			['revokeAccountCompanyApiKey', () => trevol.account.revokeAccountCompanyApiKey({ id: EMPRESA, keyId: 'key_' + '0'.repeat(32) })],
			['listAccountDianDocuments', () => trevol.account.listAccountDianDocuments()],
			['listAccountRadianEvents', () => trevol.account.listAccountRadianEvents()],
			['listAccountRequests', () => trevol.account.listAccountRequests()]
		];
		expect(llamadas.map(([n]) => n).sort()).toEqual(OPERACIONES.filter((o) => o.llave === 'administracion').map((o) => o.operationId).sort());
		for (const [nombre, llamar] of llamadas) {
			const e = (await llamar().catch((x: unknown) => x)) as ConfigurationError;
			expect(e, nombre).toBeInstanceOf(ConfigurationError);
			expect(e.message).toContain('piden una llave de administración (tva_…)');
			expect(e.message).toContain(nombre);
		}
		expect(peticiones).toHaveLength(0);
	});

	it('la matriz completa sobre la tabla de operaciones: tipo de llave × clase de operación × con o sin empresa', () => {
		const ruta = (o: (typeof OPERACIONES)[number]) => o.ruta.replace(/\{[^}]+\}/g, 'x_1');
		for (const o of OPERACIONES) {
			for (const empresa of [EMPRESA, null]) {
				// tvl_: nunca las cabeceras; account → error
				const c1 = new Headers({ 'Trevol-Company': OTRA_EMPRESA, 'Trevol-Environment': 'live' });
				const llamarApi = () => aplicarLlave(c1, { tipoLlave: 'api', entorno: 'test', empresa: null }, o, ruta(o));
				if (o.llave === 'administracion') expect(llamarApi, o.operationId).toThrow(ConfigurationError);
				else {
					llamarApi();
					expect([c1.get('trevol-company'), c1.get('trevol-environment')], o.operationId).toEqual([null, null]);
				}
				// tva_
				const c2 = new Headers({ 'Trevol-Company': OTRA_EMPRESA });
				const llamarCuenta = () => aplicarLlave(c2, { tipoLlave: 'account', entorno: 'live', empresa }, o, ruta(o));
				if (o.llave === 'api_o_administracion' && empresa === null) expect(llamarCuenta, o.operationId).toThrow(/indica la empresa/);
				else {
					llamarCuenta();
					const esperadas = o.llave === 'api_o_administracion' ? [empresa, 'live'] : [null, null];
					expect([c2.get('trevol-company'), c2.get('trevol-environment')], o.operationId).toEqual(esperadas);
				}
			}
		}
		const clases = new Set(OPERACIONES.map((o) => o.llave));
		expect([...clases].sort()).toEqual(['administracion', 'api_o_administracion', 'ninguna']);
	});

	it('una ruta que la tabla no conoce (petición cruda): con tva_ y empresa van, salvo bajo /account; sin empresa no van y no hay error', () => {
		const caso = (tipoLlave: 'api' | 'account', empresa: string | null, ruta: string) => {
			const c = new Headers();
			aplicarLlave(c, { tipoLlave, entorno: 'test', empresa }, undefined, ruta);
			return [c.get('trevol-company'), c.get('trevol-environment')];
		};
		expect(caso('account', EMPRESA, '/algo_nuevo')).toEqual([EMPRESA, 'test']);
		expect(caso('account', EMPRESA, '/account/algo_nuevo')).toEqual([null, null]);
		expect(caso('account', EMPRESA, '/account')).toEqual([null, null]);
		expect(caso('account', EMPRESA, '/accounts_payable')).toEqual([EMPRESA, 'test']);
		expect(caso('account', null, '/algo_nuevo')).toEqual([null, null]);
		expect(caso('api', null, '/algo_nuevo')).toEqual([null, null]);
	});
});

describe('el recurso account', () => {
	it('retrieveAccount: GET /v1/account con la tva_ y el modelo tipado', async () => {
		const { trevol, peticiones } = cliente(
			[
				json(200, {
					object: 'account_key_info',
					account: { id: 'acct_' + '1f'.repeat(16) },
					key: { id: 'akey_' + '2e'.repeat(16), object: 'account_key', prefix: 'tva_test_c4c4c', environment: 'test', permissions: ['companies:read'], allowed_ips: [], api_version: '2026-11-18', scope: { type: 'all', companies: [] } }
				})
			],
			{},
			LLAVE_ADMIN_TEST
		);
		const info = await trevol.account.retrieveAccount();
		expect(info.key?.environment).toBe('test');
		expect(info.key?.scope?.type).toBe('all');
		expect(peticiones[0]!.metodo).toBe('GET');
		expect(peticiones[0]!.url).toBe('https://api.trevol.si/v1/account');
	});

	it('paginate recorre listAccountCompanies con next_cursor y manda los filtros', async () => {
		const segunda = { ...EMPRESA_CUENTA, id: OTRA_EMPRESA, nit: '901234567', name: 'FERRETERÍA EL ROBLE SAS' };
		const { trevol, peticiones } = cliente([lista([EMPRESA_CUENTA], true, EMPRESA), lista([segunda], false, null)], {}, LLAVE_ADMIN_TEST);
		const ids: string[] = [];
		for await (const e of trevol.paginate((cursor) => trevol.account.listAccountCompanies({ limit: 1, status: 'enabled', startingAfter: cursor }))) ids.push(e.id!);
		expect(ids).toEqual([EMPRESA, OTRA_EMPRESA]);
		expect(new URL(peticiones[0]!.url).searchParams.get('starting_after')).toBeNull();
		expect(new URL(peticiones[1]!.url).searchParams.get('starting_after')).toBe(EMPRESA);
		expect(new URL(peticiones[1]!.url).searchParams.get('status')).toBe('enabled');
		expect(new URL(peticiones[1]!.url).pathname).toBe('/v1/account/companies');
	});

	it('paginate en las otras cuatro listas de account', async () => {
		const casos: Array<[string, string, (t: Trevol, c: string | undefined) => Promise<{ data?: Array<{ id?: string }> }>]> = [
			['key_', `/v1/account/companies/${EMPRESA}/api_keys`, (t, c) => t.account.listAccountCompanyApiKeys({ id: EMPRESA, startingAfter: c })],
			['ddoc_', '/v1/account/dian_documents', (t, c) => t.account.listAccountDianDocuments({ direction: 'received', company: `${EMPRESA},${OTRA_EMPRESA}`, startingAfter: c })],
			['rev_', '/v1/account/radian_events', (t, c) => t.account.listAccountRadianEvents({ code: '030', startingAfter: c })],
			['req_', '/v1/account/requests', (t, c) => t.account.listAccountRequests({ status: 403, startingAfter: c })]
		];
		for (const [prefijo, ruta, pedir] of casos) {
			const a = prefijo + 'a'.repeat(24);
			const b = prefijo + 'b'.repeat(24);
			const { trevol, peticiones } = cliente([lista([{ id: a }], true, a), lista([{ id: b }], false, null)], { company: EMPRESA }, LLAVE_ADMIN_LIVE);
			const ids: string[] = [];
			for await (const x of trevol.paginate((c) => pedir(trevol, c) as never)) ids.push((x as { id: string }).id);
			expect(ids, ruta).toEqual([a, b]);
			expect(peticiones.map((p) => new URL(p.url).pathname), ruta).toEqual([ruta, ruta]);
			expect(new URL(peticiones[1]!.url).searchParams.get('starting_after')).toBe(a);
			// account nunca lleva las cabeceras de empresa, aunque el cliente tenga una
			expect(peticiones.every((p) => p.cabeceras.get('trevol-company') === null)).toBe(true);
		}
	});

	it('listAccountDianDocuments repite direction y company en cada página', async () => {
		const { trevol, peticiones } = cliente([lista([{ id: 'ddoc_1' }], true, 'ddoc_1'), lista([], false, null)], {}, LLAVE_ADMIN_TEST);
		for await (const _ of trevol.paginate((c) => trevol.account.listAccountDianDocuments({ direction: 'received', company: EMPRESA, startingAfter: c }))) void _;
		for (const p of peticiones) {
			expect(new URL(p.url).searchParams.get('direction')).toBe('received');
			expect(new URL(p.url).searchParams.get('company')).toBe(EMPRESA);
		}
	});

	it('paginate con un cliente derivado: cada página lleva la empresa', async () => {
		const { trevol, peticiones } = cliente([lista([DOCUMENTO], true, DOCUMENTO.id), lista([{ ...DOCUMENTO, id: 'inv_' + '9'.repeat(32) }], false, null)], {}, LLAVE_ADMIN_TEST);
		const ids: string[] = [];
		for await (const f of trevol.paginate((c) => trevol.withCompany(EMPRESA).invoices.listInvoices({ startingAfter: c }))) ids.push(f.id!);
		expect(ids).toHaveLength(2);
		expect(peticiones.map((p) => p.cabeceras.get('trevol-company'))).toEqual([EMPRESA, EMPRESA]);
	});

	it('createAccountCompany y createAccountCompanyApiKey llevan Idempotency-Key (la de la persona o una generada); revocar no', async () => {
		const { trevol, peticiones } = cliente(
			[json(201, EMPRESA_CUENTA), json(201, { id: 'key_' + '3'.repeat(32), object: 'api_key', token: 'tvl_test_' + 'e6'.repeat(32) }), json(200, { id: 'key_' + '3'.repeat(32), object: 'api_key', status: 'revoked' })],
			{},
			LLAVE_ADMIN_LIVE
		);
		const empresa = await trevol.account.createAccountCompany({ accountCompanyInput: { nit: '900373427', name: 'DISTRIBUIDORA LOS ANDES SAS' }, idempotencyKey: 'ALTA-900373427' });
		expect(empresa.id).toBe(EMPRESA);
		const llave = await trevol.account.createAccountCompanyApiKey({ id: EMPRESA, accountApiKeyInput: { name: 'ERP de la bodega', permissions: 'write' } });
		expect(llave.token).toMatch(/^tvl_test_/);
		const revocada = await trevol.account.revokeAccountCompanyApiKey({ id: EMPRESA, keyId: 'key_' + '3'.repeat(32) });
		expect(revocada.status).toBe('revoked');
		expect(peticiones.map((p) => [p.metodo, new URL(p.url).pathname])).toEqual([
			['POST', '/v1/account/companies'],
			['POST', `/v1/account/companies/${EMPRESA}/api_keys`],
			['DELETE', `/v1/account/companies/${EMPRESA}/api_keys/key_${'3'.repeat(32)}`]
		]);
		expect(peticiones[0]!.cabeceras.get('idempotency-key')).toBe('ALTA-900373427');
		expect(peticiones[1]!.cabeceras.get('idempotency-key')).toBe('00000000-0000-4000-8000-000000000001');
		expect(peticiones[2]!.cabeceras.get('idempotency-key')).toBeNull();
		expect(JSON.parse(peticiones[0]!.cuerpo!)).toEqual({ nit: '900373427', name: 'DISTRIBUIDORA LOS ANDES SAS' });
		expect(JSON.parse(peticiones[1]!.cuerpo!)).toEqual({ name: 'ERP de la bodega', permissions: 'write' });
	});
});

describe('createAccountCompanyApiKey solo se reintenta ante un 429', () => {
	// Al repetirla con la misma Idempotency-Key la API devuelve la llave con token null: un reintento a ciegas perdería el token.
	const entrada = { id: EMPRESA, accountApiKeyInput: { name: 'ERP', permissions: 'write' as const } };

	it('la tabla la marca solo_429 aunque lleve Idempotency-Key', () => {
		const op = OPERACIONES.find((o) => o.operationId === 'createAccountCompanyApiKey')!;
		expect(op.idempotente).toBe(true);
		expect(op.reintento).toBe('solo_429');
	});

	it('un 503 → DianUnavailableError con 1 sola petición, sin esperar y con la idempotencyKey', async () => {
		const { trevol, peticiones, esperas } = cliente([problema(503, 'dian_unavailable', { retryable: true })], {}, LLAVE_ADMIN_TEST);
		const e = await trevol.account.createAccountCompanyApiKey(entrada).catch((x) => x);
		expect(e).toBeInstanceOf(DianUnavailableError);
		expect(e.idempotencyKey).toBe('00000000-0000-4000-8000-000000000001');
		expect(peticiones).toHaveLength(1);
		expect(esperas).toEqual([]);
	});

	it('un corte de red → APIConnectionError con 1 sola petición', async () => {
		const { trevol, peticiones } = cliente([new TypeError('fetch failed')], {}, LLAVE_ADMIN_TEST);
		await expect(trevol.account.createAccountCompanyApiKey(entrada)).rejects.toBeInstanceOf(APIConnectionError);
		expect(peticiones).toHaveLength(1);
	});

	it('un 429 sí se reintenta, con la misma Idempotency-Key, y devuelve el token', async () => {
		const { trevol, peticiones, esperas } = cliente(
			[
				problema(429, 'rate_limited', { retryable: true, limit: 'api_keys' }, { 'Retry-After': '2' }),
				json(201, { id: 'key_' + '3c'.repeat(16), object: 'api_key', token: 'tvl_test_' + 'e7'.repeat(32) })
			],
			{},
			LLAVE_ADMIN_TEST
		);
		const llave = await trevol.account.createAccountCompanyApiKey(entrada);
		expect(llave.token).toMatch(/^tvl_test_/);
		expect(peticiones).toHaveLength(2);
		expect(esperas).toEqual([2]);
		expect(peticiones[0]!.cabeceras.get('idempotency-key')).toBe(peticiones[1]!.cabeceras.get('idempotency-key'));
	});
});

describe('los errores de la llave de administración', () => {
	it('409 company_exists → ConflictError con problem.company; no se reintenta', async () => {
		const { trevol, peticiones } = cliente([problema(409, 'company_exists', { company: EMPRESA_CUENTA })], {}, LLAVE_ADMIN_LIVE);
		const e = await trevol.account.createAccountCompany({ accountCompanyInput: { nit: '900373427' } }).catch((x) => x);
		expect(e).toBeInstanceOf(ConflictError);
		expect((e.problem.company as { id: string }).id).toBe(EMPRESA);
		expect(peticiones).toHaveLength(1);
	});

	it('409 key_limit_reached → ConflictError', async () => {
		const { trevol } = cliente([problema(409, 'key_limit_reached')], {}, LLAVE_ADMIN_TEST);
		const e = await trevol.account.createAccountCompanyApiKey({ id: EMPRESA, accountApiKeyInput: { name: 'ERP', permissions: 'read' } }).catch((x) => x);
		expect(e).toBeInstanceOf(ConflictError);
		expect(e.code).toBe('key_limit_reached');
	});

	it('429 company_limit_reached con retry_after de una hora → RateLimitError con retryAfter, sin esperar', async () => {
		const { trevol, peticiones, esperas } = cliente([problema(429, 'company_limit_reached', { retryable: true, retry_after: 3600, limit: 'hour' }, { 'Retry-After': '3600' })], {}, LLAVE_ADMIN_LIVE);
		const e = await trevol.account.createAccountCompany({ accountCompanyInput: { nit: '900373427' } }).catch((x) => x);
		expect(e).toBeInstanceOf(RateLimitError);
		expect(e.retryAfter).toBe(3600);
		expect(e.problem.limit).toBe('hour');
		expect(e.idempotencyKey).toBe('00000000-0000-4000-8000-000000000001');
		expect(peticiones).toHaveLength(1);
		expect(esperas).toEqual([]);
	});

	it('403 environment_mismatch, live_mode_required y scope_list → PermissionDeniedError con problem.reason; required_permission', async () => {
		for (const reason of ['environment_mismatch', 'live_mode_required', 'scope_list']) {
			const { trevol } = cliente([problema(403, 'permission_denied', { reason })], { company: EMPRESA }, LLAVE_ADMIN_TEST);
			const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
			expect(e).toBeInstanceOf(PermissionDeniedError);
			expect(e.problem.reason).toBe(reason);
		}
		const { trevol } = cliente([problema(403, 'permission_denied', { required_permission: 'documents:write' })], { company: EMPRESA }, LLAVE_ADMIN_TEST);
		const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
		expect(e.problem.required_permission).toBe('documents:write');
	});
});

describe('la llave nunca se muestra', () => {
	it('ni JSON.stringify, ni util.inspect, ni String del cliente (tvl_, tva_ y uno derivado)', () => {
		const casos: Array<[Trevol, string]> = [
			[new Trevol(LLAVE_TEST), LLAVE_TEST],
			[new Trevol(LLAVE_ADMIN_TEST), LLAVE_ADMIN_TEST],
			[new Trevol(LLAVE_ADMIN_LIVE, { company: EMPRESA }), LLAVE_ADMIN_LIVE],
			[new Trevol(LLAVE_ADMIN_LIVE).withCompany(EMPRESA), LLAVE_ADMIN_LIVE]
		];
		for (const [t, llave] of casos) {
			const texto = mostrado(t);
			expect(texto).not.toContain(llave);
			expect(texto).not.toContain(llave.slice(9, 41));
		}
		expect(JSON.parse(JSON.stringify(new Trevol(LLAVE_ADMIN_LIVE, { company: EMPRESA })))).toEqual({
			environment: 'live',
			keyType: 'account',
			company: EMPRESA,
			apiVersion: '2026-11-18'
		});
	});

	it('ni los errores de configuración de la empresa', async () => {
		const errores: unknown[] = [];
		const atrapar = (f: () => unknown) => {
			try {
				f();
			} catch (x) {
				errores.push(x);
			}
		};
		atrapar(() => new Trevol(LLAVE_TEST, { company: EMPRESA }));
		atrapar(() => new Trevol(LLAVE_ADMIN_TEST, { company: 'com_mal' }));
		atrapar(() => new Trevol(LLAVE_ADMIN_TEST).withCompany('com_mal'));
		atrapar(() => new Trevol(LLAVE_ADMIN_TEST, { environment: 'live' }));
		errores.push(await new Trevol(LLAVE_ADMIN_TEST, { fetch: nunca }).invoices.listInvoices().catch((x) => x));
		errores.push(await new Trevol(LLAVE_TEST, { fetch: nunca }).account.retrieveAccount().catch((x) => x));
		expect(errores).toHaveLength(6);
		for (const e of errores) {
			expect(e).toBeInstanceOf(ConfigurationError);
			const texto = `${(e as Error).message}\n${String(e)}\n${(e as Error).stack}\n${inspect(e, { depth: 6 })}\n${JSON.stringify(e)}`;
			for (const llave of [LLAVE_TEST, LLAVE_ADMIN_TEST]) expect(texto).not.toContain(llave.slice(9));
		}
	});
});
