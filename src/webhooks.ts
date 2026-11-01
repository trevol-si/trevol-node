// Verificación de webhooks (docs/api/43 §2.6.9): Standard Webhooks sobre el CUERPO CRUDO, con la biblioteca abierta `standardwebhooks`
// y las defensas que ella no tiene (crítica C15): acepta `Headers` de fetch, objetos de Node, `Map`; texto, `Buffer`, `Uint8Array` y
// `ArrayBuffer`; exige que `webhook-timestamp` sean solo dígitos; y rechaza un cuerpo ya parseado con un mensaje que dice qué hacer.
import { Webhook as WebhookEstandar } from 'standardwebhooks';
import { EventFromJSON, type Event } from './generado/models/index.js';
import { EVENTO_DATOS } from './generado/tablas.js';
import { ConfigurationError, WebhookVerificationError } from './errores.js';

export type CabecerasEntrantes = Headers | Map<string, string | string[] | undefined> | Record<string, string | string[] | undefined>;
export type CuerpoCrudo = string | Uint8Array | ArrayBuffer;

const NOMBRES = ['webhook-id', 'webhook-timestamp', 'webhook-signature'] as const;

function primero(v: string | string[] | undefined | null): string | undefined {
	if (v === undefined || v === null) return undefined;
	return Array.isArray(v) ? v[0] : v;
}

/** Las tres cabeceras en minúsculas, venga lo que venga (`Headers`, objeto de Node con valores en arreglo, `Map`). */
export function normalizarCabeceras(c: CabecerasEntrantes): Record<string, string> {
	const salida: Record<string, string> = {};
	const poner = (k: string, v: string | string[] | undefined | null) => {
		const nombre = k.toLowerCase();
		const valor = primero(v);
		if ((NOMBRES as readonly string[]).includes(nombre) && valor !== undefined && !(nombre in salida)) salida[nombre] = valor;
	};
	if (typeof Headers !== 'undefined' && c instanceof Headers) {
		for (const n of NOMBRES) {
			const v = c.get(n);
			if (v !== null) salida[n] = v;
		}
	} else if (c instanceof Map) {
		for (const [k, v] of c) poner(String(k), v);
	} else if (c && typeof c === 'object') {
		for (const [k, v] of Object.entries(c)) poner(k, v);
	}
	return salida;
}

function aTexto(cuerpo: unknown): string {
	if (typeof cuerpo === 'string') return cuerpo;
	if (cuerpo instanceof Uint8Array) return new TextDecoder('utf-8').decode(cuerpo);
	if (cuerpo instanceof ArrayBuffer) return new TextDecoder('utf-8').decode(new Uint8Array(cuerpo));
	throw new WebhookVerificationError(
		'El cuerpo del webhook debe ser el CUERPO CRUDO (texto, Buffer, Uint8Array o ArrayBuffer), no un objeto ya parseado: la firma se ' +
			'calcula sobre los bytes exactos. En Express usa express.raw({ type: "application/json" }); en Next.js/Hono/SvelteKit, await request.text().',
		'cuerpo'
	);
}

export class Webhook {
	readonly #verificador: WebhookEstandar;

	/**
	 * @param secreto El secreto del endpoint (`whsec_…`), que se muestra una sola vez al crearlo o rotarlo.
	 * La tolerancia de 5 minutos sobre `webhook-timestamp` la fija la biblioteca de Standard Webhooks y no se puede cambiar.
	 */
	constructor(secreto: string) {
		if (typeof secreto !== 'string' || secreto.trim() === '') {
			throw new ConfigurationError('Falta el secreto del webhook (whsec_…). Se muestra una sola vez al crear o rotar el endpoint.');
		}
		try {
			this.#verificador = new WebhookEstandar(secreto.trim());
		} catch {
			throw new ConfigurationError('El secreto del webhook no tiene el formato esperado (whsec_ + base64).');
		}
	}

	/**
	 * Verifica la firma y la fecha de una entrega y devuelve el evento. Lanza `WebhookVerificationError` si algo no cuadra.
	 * Ojo: la verificación NO evita repeticiones dentro de los 5 minutos ni los reintentos de entrega: deduplica por `webhook-id`.
	 */
	verify(cuerpo: CuerpoCrudo, cabeceras: CabecerasEntrantes): Event {
		const texto = aTexto(cuerpo);
		const h = normalizarCabeceras(cabeceras);
		for (const n of NOMBRES) {
			if (!h[n]) throw new WebhookVerificationError(`Falta la cabecera ${n}.`, 'cabeceras');
		}
		if (!/^[0-9]{1,12}$/.test(h['webhook-timestamp']!)) {
			throw new WebhookVerificationError('El webhook-timestamp no es un número de segundos.', 'fecha');
		}
		try {
			this.#verificador.verify(texto, h, { jsonParse: false } as never);
		} catch (e) {
			const m = e instanceof Error ? e.message : '';
			if (/timestamp/i.test(m)) throw new WebhookVerificationError(`La fecha del webhook está fuera de la tolerancia de 5 minutos (${m}).`, 'fecha');
			if (/headers/i.test(m)) throw new WebhookVerificationError('Las cabeceras del webhook no son válidas.', 'cabeceras');
			throw new WebhookVerificationError('La firma del webhook no coincide: revisa el secreto y que el cuerpo sea el crudo, sin reescribir.', 'firma');
		}
		let json: unknown;
		try {
			json = JSON.parse(texto);
		} catch {
			throw new WebhookVerificationError('El cuerpo firmado no es JSON.', 'cuerpo');
		}
		return EventFromJSON(json);
	}

	/**
	 * Los `data` del evento como el modelo de su `type` (p. ej. `DocumentEventData` para `invoice.accepted`). `undefined` si el tipo es
	 * nuevo y este SDK todavía no lo conoce: el evento no se pierde, `evento.data` sigue ahí como mapa.
	 */
	eventData(evento: Event): unknown {
		const leer = EVENTO_DATOS[evento.type as string];
		return leer ? leer(evento.data) : undefined;
	}
}
