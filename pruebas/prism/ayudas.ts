// Ayudas de las pruebas contra Prism (docs/api/43 §2.10.2). Prism valida cada petición contra docs/api/openapi.json (la PÚBLICA).
import { Trevol, TrevolError } from '../../src/index.js';

export const URL_PRISM = process.env.TREVOL_PRISM_URL;
export const LLAVE = process.env.TREVOL_API_KEY ?? 'tvl_test_' + 'a1'.repeat(32);

/** Un cliente contra Prism (que sirve las rutas SIN el /v1), sin reintentos para ver el primer resultado. */
export const clientePrism = (opciones: ConstructorParameters<typeof Trevol>[1] = {}) =>
	new Trevol(LLAVE, { baseUrl: URL_PRISM, maxRetries: 0, ...opciones });

/** Si Prism rechaza la petición (cuerpo mal serializado, cabecera olvidada…) lo dice en `sl-violations`: se lo pegamos al error. */
export async function conViolaciones<T>(f: () => Promise<T>): Promise<T> {
	try {
		return await f();
	} catch (e) {
		if (e instanceof TrevolError && e.headers?.get('sl-violations')) {
			throw new Error(`Prism rechazó la petición (${e.status}): ${e.headers.get('sl-violations')}`, { cause: e });
		}
		throw e;
	}
}

/**
 * Una cabecera `Prefer` de Prism (`code=422`, `example=tacita`). Va como función de `initOverrides`: el código generado REEMPLAZA todas las
 * cabeceras si le pasas `{ headers }` (perderías el Content-Type), así que se parte de las que ya trae.
 */
export const prefer =
	(valor: string) =>
	async ({ init }: { init: { headers?: Record<string, string> } }) => ({ headers: { ...init.headers, Prefer: valor } });
