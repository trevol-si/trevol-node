// La llave de la API: su formato y el entorno que se deduce de su prefijo (docs/api/43 §2.6.1).
import { ConfigurationError } from './errores.js';

export type Entorno = 'test' | 'live';

const FORMATO = /^tvl_(test|live)_[0-9a-f]{64}$/;

/** Valida la llave y devuelve su entorno: `test` (habilitación de la DIAN) o `live` (producción). El mensaje NUNCA incluye la llave. */
export function entornoDeLaLlave(llave: unknown): Entorno {
	const m = typeof llave === 'string' ? FORMATO.exec(llave.trim()) : null;
	if (!m) {
		throw new ConfigurationError(
			'La llave de la API no tiene el formato esperado (tvl_test_… o tvl_live_… con 64 caracteres hexadecimales). ' +
				'Créala en https://platform.trevol.si/llaves y pásala completa o define TREVOL_API_KEY.'
		);
	}
	return m[1] as Entorno;
}
