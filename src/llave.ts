// La llave de la API: su formato, su tipo y el entorno que se deduce de su prefijo (docs/api/43 §2.6.1; la de administración, docs/api/35).
import { ConfigurationError } from './errores.js';

export type Entorno = 'test' | 'live';

/** `api`: la llave de una empresa (`tvl_…`). `account`: la llave de administración de una cuenta (`tva_…`). */
export type TipoDeLlave = 'api' | 'account';

export interface DatosDeLlave {
	tipo: TipoDeLlave;
	entorno: Entorno;
}

const FORMATO = /^(tvl|tva)_(test|live)_[0-9a-f]{64}$/;
const EMPRESA = /^com_[0-9a-f]{32}$/;

/** Valida la llave y dice de qué tipo es y de qué entorno: `test` (habilitación de la DIAN) o `live` (producción). El mensaje NUNCA incluye la llave. */
export function datosDeLaLlave(llave: unknown): DatosDeLlave {
	const m = typeof llave === 'string' ? FORMATO.exec(llave.trim()) : null;
	if (!m) {
		throw new ConfigurationError(
			'La llave de la API no tiene el formato esperado (tvl_test_…, tvl_live_…, tva_test_… o tva_live_… con 64 caracteres hexadecimales). ' +
				'La de una empresa se crea en https://platform.trevol.si/llaves y la de administración en ' +
				'https://platform.trevol.si/administracion; pásala completa o define TREVOL_API_KEY.'
		);
	}
	return { tipo: m[1] === 'tva' ? 'account' : 'api', entorno: m[2] as Entorno };
}

/** El entorno de la llave (`tvl_` o `tva_`). Se conserva por compatibilidad: `datosDeLaLlave` dice además el tipo. */
export function entornoDeLaLlave(llave: unknown): Entorno {
	return datosDeLaLlave(llave).entorno;
}

/** Valida el id de una empresa (`com_` y 32 caracteres hexadecimales en minúscula) y lo devuelve sin espacios alrededor. */
export function validarEmpresa(empresa: unknown): string {
	const limpia = typeof empresa === 'string' ? empresa.trim() : '';
	if (!EMPRESA.test(limpia)) {
		throw new ConfigurationError(
			'El id de la empresa no tiene el formato esperado (com_ y 32 caracteres hexadecimales en minúscula, como sale en ' +
				'GET /v1/account/companies).'
		);
	}
	return limpia;
}
