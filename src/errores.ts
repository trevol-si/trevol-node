// Los errores del SDK (docs/api/43-sdks-y-documentacion.md §2.6.5). Toda respuesta que no es 2xx se convierte en uno de estos, con el
// `code` del problem+json: es el mismo vocabulario que la documentación (https://platform.trevol.si/docs/errores).
// Ningún error lleva la llave ni las cabeceras de la PETICIÓN.

/** Una de las `errors[]` de un problema 422: qué campo falló y por qué. */
export interface ErrorDeCampo {
	field?: string;
	pointer?: string;
	message?: string;
	[otro: string]: unknown;
}

export interface DatosDeError {
	status?: number | null;
	code?: string | null;
	type?: string | null;
	title?: string | null;
	detail?: string | null;
	requestId?: string | null;
	retryable?: boolean | null;
	retryAfter?: number | null;
	errors?: ErrorDeCampo[];
	idempotencyKey?: string | null;
	/** El cuerpo problem+json completo, con los campos extra (`existing_id`, `reason`, `document`, `rules`…). */
	problem?: Record<string, unknown> | null;
	headers?: Headers | null;
	cause?: unknown;
}

/** La base de todos los errores del SDK: un `catch` que solo conozca esta clase ya lo atrapa todo. */
export class TrevolError extends Error {
	override name = 'TrevolError';
	readonly status: number | null;
	readonly code: string | null;
	readonly type: string | null;
	readonly title: string | null;
	readonly detail: string | null;
	readonly requestId: string | null;
	readonly retryable: boolean | null;
	readonly retryAfter: number | null;
	readonly errors: ErrorDeCampo[];
	/** La Idempotency-Key de la llamada: úsala para reintentar más tarde con la MISMA clave. */
	readonly idempotencyKey: string | null;
	readonly problem: Record<string, unknown> | null;
	/** Las cabeceras de la RESPUESTA. */
	readonly headers: Headers | null;

	constructor(mensaje: string, datos: DatosDeError = {}) {
		super(mensaje, datos.cause === undefined ? undefined : { cause: datos.cause });
		this.status = datos.status ?? null;
		this.code = datos.code ?? null;
		this.type = datos.type ?? null;
		this.title = datos.title ?? null;
		this.detail = datos.detail ?? null;
		this.requestId = datos.requestId ?? null;
		this.retryable = datos.retryable ?? null;
		this.retryAfter = datos.retryAfter ?? null;
		this.errors = datos.errors ?? [];
		this.idempotencyKey = datos.idempotencyKey ?? null;
		this.problem = datos.problem ?? null;
		this.headers = datos.headers ?? null;
	}

	override toString(): string {
		const partes = [this.name];
		if (this.code) partes.push(this.code);
		if (this.status !== null) partes.push(`HTTP ${this.status}`);
		const cabeza = partes.join(' ');
		const cola = this.requestId ? ` [request_id=${this.requestId}]` : '';
		return `${cabeza}: ${this.detail ?? this.title ?? this.message}${cola}`;
	}
}

export class AuthenticationError extends TrevolError {
	override name = 'AuthenticationError';
}
export class PermissionDeniedError extends TrevolError {
	override name = 'PermissionDeniedError';
}
export class NotFoundError extends TrevolError {
	override name = 'NotFoundError';
}
export class InvalidRequestError extends TrevolError {
	override name = 'InvalidRequestError';
}
export class IdempotencyError extends TrevolError {
	override name = 'IdempotencyError';
}
/** 422 `validation_error`: `errors` dice qué campo (`pointer`) y por qué. */
export class ValidationError extends TrevolError {
	override name = 'ValidationError';
}
export class ConflictError extends TrevolError {
	override name = 'ConflictError';
}
export class PreconditionError extends TrevolError {
	override name = 'PreconditionError';
}
/** 422 `dian_rejected`: `problem.document` trae el documento y `problem.rules` las reglas que la DIAN aplicó. */
export class DianRejectedError extends TrevolError {
	override name = 'DianRejectedError';
}
export class BalanceError extends TrevolError {
	override name = 'BalanceError';
}
export class RateLimitError extends TrevolError {
	override name = 'RateLimitError';
}
export class DianUnavailableError extends TrevolError {
	override name = 'DianUnavailableError';
}
export class InternalServerError extends TrevolError {
	override name = 'InternalServerError';
}
/** No hubo respuesta: red, DNS, TLS o tiempo agotado. Lleva la `idempotencyKey` para reintentar sin duplicar. */
export class APIConnectionError extends TrevolError {
	override name = 'APIConnectionError';
}
/** Mal uso del SDK, antes de llamar: llave mal formada, entorno que no coincide, navegador. Nunca incluye la llave. */
export class ConfigurationError extends TrevolError {
	override name = 'ConfigurationError';
}
/** La firma, la fecha o las cabeceras de un webhook no son válidas. */
export class WebhookVerificationError extends TrevolError {
	override name = 'WebhookVerificationError';
	/** `firma`, `fecha` o `cabeceras`. */
	readonly motivo: 'firma' | 'fecha' | 'cabeceras' | 'cuerpo';
	constructor(mensaje: string, motivo: 'firma' | 'fecha' | 'cabeceras' | 'cuerpo') {
		super(mensaje);
		this.motivo = motivo;
	}
}

// La clase de cada nombre de la tabla CLASE_POR_CODE / CLASE_POR_ESTADO (sdks/especificacion/errores.json).
const CLASES: Readonly<Record<string, new (m: string, d?: DatosDeError) => TrevolError>> = {
	AuthenticationError,
	PermissionDeniedError,
	NotFoundError,
	InvalidRequestError,
	IdempotencyError,
	ValidationError,
	ConflictError,
	PreconditionError,
	DianRejectedError,
	BalanceError,
	RateLimitError,
	DianUnavailableError,
	InternalServerError
};

/** El texto de una respuesta que no era problem+json, recortado a 2 KB. */
const RECORTE = 2048;

/** Un número finito y no negativo, o null. */
function numero(v: unknown): number | null {
	const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
	return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
}

/** El valor de `Retry-After`: segundos o una fecha HTTP. Null si no está o no se entiende. */
export function leerRetryAfter(valor: string | null | undefined, ahoraMs: number = Date.now()): number | null {
	if (!valor) return null;
	const segundos = numero(valor);
	if (segundos !== null) return segundos;
	const fecha = Date.parse(valor);
	return Number.isNaN(fecha) ? null : Math.max(0, Math.ceil((fecha - ahoraMs) / 1000));
}

/**
 * Convierte una respuesta que no es 2xx en su error tipado. El cuerpo se lee como un mapa TOLERANTE (nunca con el modelo generado: un
 * `code` nuevo o un campo que falta no puede romper el manejo de errores).
 */
export function errorDeRespuesta(
	estado: number,
	texto: string,
	cabeceras: Headers,
	tablas: { porCode: Readonly<Record<string, string>>; porEstado: Readonly<Record<string, string>> },
	idempotencyKey: string | null
): TrevolError {
	let cuerpo: Record<string, unknown> | null = null;
	try {
		const j: unknown = JSON.parse(texto);
		if (j && typeof j === 'object' && !Array.isArray(j)) cuerpo = j as Record<string, unknown>;
	} catch {
		cuerpo = null;
	}
	const cadena = (v: unknown) => (typeof v === 'string' ? v : null);
	const code = cuerpo ? cadena(cuerpo.code) : null;
	const requestId = (cuerpo ? cadena(cuerpo.request_id) : null) ?? cabeceras.get('request-id');
	const retryAfter = leerRetryAfter(cabeceras.get('retry-after')) ?? (cuerpo ? numero(cuerpo.retry_after) : null);
	const errors = cuerpo && Array.isArray(cuerpo.errors) ? (cuerpo.errors.filter((x) => x && typeof x === 'object') as ErrorDeCampo[]) : [];
	const detail = cuerpo ? cadena(cuerpo.detail) : null;
	const title = cuerpo ? cadena(cuerpo.title) : null;
	const datos: DatosDeError = {
		status: estado,
		code,
		type: cuerpo ? cadena(cuerpo.type) : null,
		title,
		detail: cuerpo ? detail : texto.trim().slice(0, RECORTE) || null,
		requestId,
		retryable: cuerpo && typeof cuerpo.retryable === 'boolean' ? cuerpo.retryable : null,
		retryAfter,
		errors,
		idempotencyKey,
		problem: cuerpo,
		headers: cabeceras
	};
	const mensaje = detail ?? title ?? (cuerpo ? `La API respondió ${estado}` : `La API respondió ${estado} sin problem+json`);
	// Un code conocido manda; uno desconocido (la API sumó uno) es la base; sin code, la clase del estado.
	let clase: string | undefined;
	if (code) clase = tablas.porCode[code];
	else clase = tablas.porEstado[String(estado)] ?? (estado >= 500 ? tablas.porEstado['5xx'] : undefined);
	const Ctor = (clase && CLASES[clase]) || TrevolError;
	return new Ctor(mensaje, datos);
}
