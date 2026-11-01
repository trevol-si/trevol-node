// Ayudas de las pruebas: un fetch falso que graba las peticiones y un cliente con reloj y azar inyectados.
import { readFileSync } from 'node:fs';
import { Trevol, type OpcionesTrevol } from '../src/index.js';

export const HEX = '3f0c1a2b'.repeat(8);
export const LLAVE_TEST = 'tvl_test_' + 'a1'.repeat(32);
export const LLAVE_LIVE = 'tvl_live_' + 'b2'.repeat(32);
export const BASE = 'https://api.trevol.si/v1';

export const datos = <T = any>(nombre: string): T => JSON.parse(readFileSync(new URL(`./datos/${nombre}`, import.meta.url), 'utf8'));

export interface Peticion {
	url: string;
	metodo: string;
	cabeceras: Headers;
	cuerpo: string | null;
}

type Respuesta = Response | Error | (() => Response | Error);

/** Un fetch que contesta en orden lo que se le da (la última se repite) y graba cada petición. */
export function fetchFalso(respuestas: Respuesta[]) {
	const peticiones: Peticion[] = [];
	let i = 0;
	const f = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
		peticiones.push({
			url: String(entrada),
			metodo: (init?.method ?? 'GET').toUpperCase(),
			cabeceras: new Headers(init?.headers),
			cuerpo: typeof init?.body === 'string' ? init.body : null
		});
		let r = respuestas[Math.min(i++, respuestas.length - 1)]!;
		if (typeof r === 'function') r = r();
		if (r instanceof Error) throw r;
		return r.clone();
	}) as typeof fetch;
	return { fetch: f, peticiones };
}

export const json = (estado: number, cuerpo: unknown, cabeceras: Record<string, string> = {}) =>
	new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'content-type': 'application/json', ...cabeceras } });
export const problema = (estado: number, code: string, extra: Record<string, unknown> = {}, cabeceras: Record<string, string> = {}) =>
	new Response(
		JSON.stringify({
			type: `https://platform.trevol.si/docs/errores#${code}`,
			title: 'Título',
			status: estado,
			code,
			retryable: false,
			detail: `Detalle de ${code}`,
			request_id: 'req_' + 'c3'.repeat(12),
			...extra
		}),
		{ status: estado, headers: { 'content-type': 'application/problem+json', ...cabeceras } }
	);

export const DOCUMENTO = {
	id: 'inv_' + HEX.slice(0, 32),
	object: 'invoice',
	environment: 'test',
	status: 'accepted',
	number: 'SETP990012345',
	external_id: 'VENTA-2026-000123'
};

/** Un cliente con el fetch falso, sin esperas reales y con el azar en 1 (factor de espera 1,0). */
export function cliente(respuestas: Respuesta[], opciones: OpcionesTrevol = {}, llave = LLAVE_TEST) {
	const falso = fetchFalso(respuestas);
	const esperas: number[] = [];
	let n = 0;
	const trevol = new Trevol(llave, {
		fetch: falso.fetch,
		internos: { sleep: async (s) => void esperas.push(s), random: () => 1, uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
		...opciones
	});
	return { trevol, peticiones: falso.peticiones, esperas };
}

export const ENTRADA_FACTURA = { external_id: 'VENTA-2026-000123', customer: { final_consumer: true }, items: [{ description: 'Café', quantity: '1', unit_price: '1000' }] } as any;
