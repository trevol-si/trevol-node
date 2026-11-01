// El transporte: lo que hace que las llamadas se comporten igual en los 7 SDK (docs/api/43 §2.6.2 a §2.6.5). Se conecta a lo generado
// por `Configuration.fetchApi`; un error tipado que se lance AQUÍ no lo envuelve nadie (el runtime generado solo envuelve lo que lance
// el `fetch` crudo si ningún `onError` lo relanza: ver `middlewareDeErrores`).
import { CLASE_POR_CODE, CLASE_POR_ESTADO, OPERACIONES, type InfoOperacion } from './generado/tablas.js';
import { APIConnectionError, ConfigurationError, TrevolError, errorDeRespuesta } from './errores.js';

export type ClaseReintento = 'seguro' | 'solo_429';

export interface Resultado {
	tipo: 'respuesta' | 'red';
	estado?: number;
	code?: string | null;
	retryable?: boolean | null;
	/** Segundos, ya resueltos (cabecera o `retry_after` del cuerpo). */
	retryAfter?: number | null;
}

export interface EntradaDecidir {
	/** El intento que acaba de fallar: 1 es el primero. */
	intento: number;
	reintento: ClaseReintento;
	maxReintentos: number;
	/** Segundos. Si `Retry-After` pide más, no se espera: se lanza el error con `retryAfter`. */
	maxRetryAfter: number;
	/** El número al azar en [0, 1) (inyectable en las pruebas). */
	azar: number;
	resultado: Resultado;
}

export interface Decision {
	reintentar: boolean;
	/** Segundos a esperar antes del siguiente intento. */
	espera?: number;
	/** `exito`, `agotado` o `retry_after_excede` cuando el «no» tiene una razón que contar. */
	motivo?: 'exito' | 'agotado' | 'retry_after_excede';
}

const ESTADOS_REINTENTABLES = new Set([429, 500, 502, 503, 504]);
const CODES_EN_CURSO = new Set(['request_in_progress', 'previous_event_pending']);

/** La espera propia antes del intento siguiente: 0,5 · 2^(intento−1), con tope de 8 s, por un factor al azar en [0,75; 1]. */
export function esperaPropia(intento: number, azar: number): number {
	return Math.min(0.5 * 2 ** (intento - 1), 8) * (0.75 + 0.25 * azar);
}

/** Función PURA: ¿se reintenta y cuánto se espera? Las mismas reglas, los mismos casos (`pruebas/datos/transporte.json`) en los 7 SDK. */
export function decidir(e: EntradaDecidir): Decision {
	const r = e.resultado;
	if (r.tipo === 'respuesta' && (r.estado ?? 0) >= 200 && (r.estado ?? 0) < 300) return { reintentar: false, motivo: 'exito' };
	let reintentable: boolean;
	if (r.tipo === 'red') {
		reintentable = e.reintento === 'seguro';
	} else {
		const estado = r.estado ?? 0;
		if (e.reintento === 'solo_429') reintentable = estado === 429;
		else if (estado === 402) reintentable = false;
		else reintentable = ESTADOS_REINTENTABLES.has(estado) || (!!r.code && CODES_EN_CURSO.has(r.code)) || r.retryable === true;
	}
	if (!reintentable) return { reintentar: false };
	if (e.intento > e.maxReintentos) return { reintentar: false, motivo: 'agotado' };
	const propia = esperaPropia(e.intento, e.azar);
	const pedida = r.tipo === 'respuesta' && r.retryAfter && r.retryAfter > 0 ? r.retryAfter : 0;
	if (pedida > e.maxRetryAfter) return { reintentar: false, motivo: 'retry_after_excede' };
	return { reintentar: true, espera: Math.max(pedida, propia) };
}

// ── Qué operación es una petición ───────────────────────────────────────────
interface Ruta extends InfoOperacion {
	patron: RegExp;
	literales: number;
}

const RUTAS: readonly Ruta[] = OPERACIONES.map((o) => ({
	...o,
	patron: new RegExp('^' + o.ruta.split('/').map((s) => (s.startsWith('{') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '$'),
	literales: o.ruta.split('/').filter((s) => s && !s.startsWith('{')).length
})).sort((a, b) => b.literales - a.literales);

/** La operación de un método y una ruta (relativa a la URL base, p. ej. `/invoices/inv_…/pdf`). Los segmentos fijos ganan a `{id}`. */
export function operacionDe(metodo: string, ruta: string): InfoOperacion | undefined {
	const m = metodo.toUpperCase();
	return RUTAS.find((o) => o.metodo === m && o.patron.test(ruta));
}

// ── La Idempotency-Key ──────────────────────────────────────────────────────
const CLAVE_VALIDA = /^[!-~]{1,255}$/;

export function validarClave(clave: string): void {
	if (!CLAVE_VALIDA.test(clave)) {
		throw new ConfigurationError('La idempotencyKey debe tener de 1 a 255 caracteres ASCII visibles (sin espacios).');
	}
}

// ── El fetch con reintentos ─────────────────────────────────────────────────
export interface OpcionesTransporte {
	llave: string;
	apiVersion: string;
	baseUrl: string;
	userAgent: string;
	maxReintentos: number;
	/** Segundos por intento. */
	timeout: number;
	maxRetryAfter: number;
	fetch: typeof fetch;
	sleep: (segundos: number) => Promise<void>;
	random: () => number;
	uuid: () => string;
}

// Lo que la API contesta: el archivo (o JSON) si sale bien, y problem+json si no. Así lo pide el SDK (un servidor simulado que negocia por
// `Accept`, como Prism, solo ofrece el error si lo aceptas).
const PROBLEMA = 'application/problem+json';
const ACCEPT: Record<string, string> = {
	pdf: `application/pdf, ${PROBLEMA}`,
	xml: `application/xml, ${PROBLEMA}`,
	zip: `application/zip, ${PROBLEMA}`,
	json: `application/json, ${PROBLEMA}`
};

function esAborto(e: unknown): boolean {
	return e instanceof Error && e.name === 'AbortError';
}

/** El `fetch` que se le entrega al código generado (`Configuration.fetchApi`). Devuelve la respuesta 2xx; lanza el error tipado en todo lo demás. */
export function crearFetch(o: OpcionesTransporte): (url: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
	const base = new URL(o.baseUrl);
	const prefijo = base.pathname.replace(/\/+$/, '');
	return async (entrada, init = {}) => {
		const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
		const metodo = (init.method ?? 'GET').toUpperCase();
		const parsed = new URL(url);
		const ruta = parsed.pathname.startsWith(prefijo) ? parsed.pathname.slice(prefijo.length) || '/' : parsed.pathname;
		const op = parsed.origin === base.origin ? operacionDe(metodo, ruta) : undefined;
		const reintento: ClaseReintento = op ? op.reintento : metodo === 'GET' ? 'seguro' : 'solo_429';

		const cabeceras = new Headers(init.headers);
		cabeceras.set('Authorization', `Bearer ${o.llave}`);
		cabeceras.set('Trevol-Version', o.apiVersion);
		if (typeof window === 'undefined') cabeceras.set('User-Agent', o.userAgent);
		cabeceras.set('Accept', ACCEPT[op?.binario ?? 'json'] ?? '*/*');
		// La Idempotency-Key: la de la persona, o UNA generada antes del primer intento (la misma en todos los reintentos).
		let clave: string | null = null;
		if (op?.idempotente) {
			const dada = cabeceras.get('Idempotency-Key');
			if (dada !== null) validarClave(dada);
			clave = dada ?? o.uuid();
			cabeceras.set('Idempotency-Key', clave);
		} else {
			cabeceras.delete('Idempotency-Key');
		}

		let intento = 0;
		for (;;) {
			intento++;
			let resultado: Resultado;
			let respuesta: Response | null = null;
			let texto = '';
			let causa: unknown;
			try {
				const tiempo = AbortSignal.timeout(o.timeout * 1000);
				const senal = init.signal ? AbortSignal.any([init.signal, tiempo]) : tiempo;
				respuesta = await o.fetch(url, { ...init, headers: cabeceras, signal: senal });
			} catch (e) {
				if (esAborto(e) && init.signal?.aborted) throw e; // la persona canceló: no es un fallo de red ni se reintenta
				causa = e;
			}
			if (respuesta === null) {
				resultado = { tipo: 'red' };
			} else if (respuesta.ok) {
				return respuesta;
			} else {
				texto = await respuesta.text().catch(() => '');
				resultado = { tipo: 'respuesta', estado: respuesta.status };
				const e = errorDeRespuesta(respuesta.status, texto, respuesta.headers, { porCode: CLASE_POR_CODE, porEstado: CLASE_POR_ESTADO }, clave);
				resultado.code = e.code;
				resultado.retryable = e.retryable;
				resultado.retryAfter = e.retryAfter;
				const d = decidir({ intento, reintento, maxReintentos: o.maxReintentos, maxRetryAfter: o.maxRetryAfter, azar: o.random(), resultado });
				if (!d.reintentar) throw e;
				await o.sleep(d.espera ?? 0);
				continue;
			}
			const d = decidir({ intento, reintento, maxReintentos: o.maxReintentos, maxRetryAfter: o.maxRetryAfter, azar: o.random(), resultado });
			if (!d.reintentar) {
				const detalle = causa instanceof Error ? causa.message : 'no hubo respuesta';
				throw new APIConnectionError(`No pude conectar con la API de Trevol (${detalle}).`, { cause: causa, idempotencyKey: clave });
			}
			await o.sleep(d.espera ?? 0);
		}
	};
}

/**
 * Para `Configuration.middleware`: relanza los errores tipados que lanza nuestro `fetch`. Sin esto, el runtime generado los envolvería en
 * `FetchError` (lo que lance `fetchApi` pasa por `onError`; si éste lanza, nadie lo envuelve).
 */
export const middlewareDeErrores = {
	onError: async ({ error }: { error: unknown }): Promise<Response | void> => {
		if (error instanceof TrevolError) throw error;
	}
};
