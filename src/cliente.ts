// El cliente: `new Trevol(llave, opciones)` (docs/api/43 §2.6.1).
import {
	BalanceApi,
	Configuration,
	CreditNotesApi,
	DebitNotesApi,
	EquivalentDocumentAdjustmentsApi,
	EquivalentDocumentsApi,
	EventsApi,
	GeneralApi,
	InvoicesApi,
	PayrollAdjustmentsApi,
	PayrollsApi,
	RadianEventsApi,
	RequestsApi,
	SupportDocumentAdjustmentsApi,
	SupportDocumentsApi,
	WebhookEndpointsApi
} from './generado/index.js';
import { API_VERSION, VERSION } from './generado/tablas.js';
import { ConfigurationError } from './errores.js';
import { entornoDeLaLlave, type Entorno } from './llave.js';
import { paginar, type Pagina } from './paginacion.js';
import { crearFetch, middlewareDeErrores } from './transporte.js';

export interface OpcionesTrevol {
	/** El valor de `Trevol-Version` en cada petición. Por defecto la versión con que se generó este SDK (`API_VERSION`). */
	apiVersion?: string;
	/** Reintentos tras el primer intento (3 intentos en total por defecto). 0 los apaga. */
	maxRetries?: number;
	/** Segundos por intento. Por defecto 65, como el playground. */
	timeout?: number;
	/** Si `Retry-After` pide esperar más segundos que esto, no se espera: se lanza el error con `retryAfter`. Por defecto 60. */
	maxRetryAfter?: number;
	/** Por defecto https://api.trevol.si/v1 (para un servidor simulado en las pruebas). */
	baseUrl?: string;
	/** Si se pasa y la llave no coincide, error de configuración ANTES de llamar. */
	environment?: Entorno;
	/** Tu `fetch` (proxies, pruebas). Por defecto el global. */
	fetch?: typeof fetch;
	/** La llave nunca debe ir en un navegador. Solo con esto en `true` se permite (y asumes que la expones). */
	dangerouslyAllowBrowser?: boolean;
	/** Solo para pruebas: el reloj y el azar. */
	internos?: { sleep?: (segundos: number) => Promise<void>; random?: () => number; uuid?: () => string };
}

const URL_BASE = 'https://api.trevol.si/v1';

export class Trevol {
	/** `test` (habilitación de la DIAN) o `live` (producción), deducido del prefijo de la llave. */
	readonly environment: Entorno;
	readonly apiVersion: string;

	readonly balance: BalanceApi;
	readonly creditNotes: CreditNotesApi;
	readonly debitNotes: DebitNotesApi;
	readonly equivalentDocumentAdjustments: EquivalentDocumentAdjustmentsApi;
	readonly equivalentDocuments: EquivalentDocumentsApi;
	readonly events: EventsApi;
	readonly general: GeneralApi;
	readonly invoices: InvoicesApi;
	readonly payrollAdjustments: PayrollAdjustmentsApi;
	readonly payrolls: PayrollsApi;
	readonly radianEvents: RadianEventsApi;
	readonly requests: RequestsApi;
	readonly supportDocumentAdjustments: SupportDocumentAdjustmentsApi;
	readonly supportDocuments: SupportDocumentsApi;
	readonly webhookEndpoints: WebhookEndpointsApi;

	/** @param llave tvl_test_… o tvl_live_…; si falta se lee `TREVOL_API_KEY`. */
	constructor(llave?: string, opciones: OpcionesTrevol = {}) {
		if (typeof window !== 'undefined' && typeof document !== 'undefined' && !opciones.dangerouslyAllowBrowser) {
			throw new ConfigurationError(
				'Este SDK no debe usarse en un navegador: la llave de la API daría acceso a tu cuenta a cualquiera que abra las herramientas del ' +
					'navegador. Llama a Trevol desde tu servidor. Si de verdad lo necesitas, pasa dangerouslyAllowBrowser: true.'
			);
		}
		const dada = llave ?? (typeof process !== 'undefined' ? process.env?.TREVOL_API_KEY : undefined);
		if (dada === undefined || dada === '') {
			throw new ConfigurationError('Falta la llave de la API: pásala a new Trevol(llave) o define la variable de entorno TREVOL_API_KEY.');
		}
		this.environment = entornoDeLaLlave(dada);
		if (opciones.environment !== undefined && opciones.environment !== this.environment) {
			throw new ConfigurationError(
				`Pediste el entorno «${opciones.environment}» pero la llave es de «${this.environment}»` +
					` (${this.environment === 'test' ? 'tvl_test_ = habilitación' : 'tvl_live_ = producción'}).`
			);
		}
		const llaveLimpia = dada.trim();
		this.apiVersion = opciones.apiVersion ?? API_VERSION;
		const baseUrl = (opciones.baseUrl ?? URL_BASE).replace(/\/+$/, '');
		const i = opciones.internos ?? {};
		const cargaFetch = opciones.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
		const fetchApi = crearFetch({
			llave: llaveLimpia,
			apiVersion: this.apiVersion,
			baseUrl,
			userAgent: `trevol-node/${VERSION} (${typeof process !== 'undefined' ? `node ${process.version}` : 'runtime'}; +https://platform.trevol.si/docs)`,
			maxReintentos: opciones.maxRetries ?? 2,
			timeout: opciones.timeout ?? 65,
			maxRetryAfter: opciones.maxRetryAfter ?? 60,
			fetch: cargaFetch,
			sleep: i.sleep ?? ((s) => new Promise((r) => setTimeout(r, s * 1000))),
			random: i.random ?? Math.random,
			uuid: i.uuid ?? (() => globalThis.crypto.randomUUID())
		});
		const config = new Configuration({ basePath: baseUrl, fetchApi: fetchApi as typeof fetch, middleware: [middlewareDeErrores] });
		this.balance = new BalanceApi(config);
		this.creditNotes = new CreditNotesApi(config);
		this.debitNotes = new DebitNotesApi(config);
		this.equivalentDocumentAdjustments = new EquivalentDocumentAdjustmentsApi(config);
		this.equivalentDocuments = new EquivalentDocumentsApi(config);
		this.events = new EventsApi(config);
		this.general = new GeneralApi(config);
		this.invoices = new InvoicesApi(config);
		this.payrollAdjustments = new PayrollAdjustmentsApi(config);
		this.payrolls = new PayrollsApi(config);
		this.radianEvents = new RadianEventsApi(config);
		this.requests = new RequestsApi(config);
		this.supportDocumentAdjustments = new SupportDocumentAdjustmentsApi(config);
		this.supportDocuments = new SupportDocumentsApi(config);
		this.webhookEndpoints = new WebhookEndpointsApi(config);
	}

	/**
	 * Recorre todas las páginas de un listado: `for await (const f of trevol.paginate((cursor) => trevol.invoices.listInvoices({ limit: 100, startingAfter: cursor }))) { … }`.
	 */
	paginate<T extends { id?: string }>(pagina: (cursor: string | undefined) => Promise<Pagina<T>>): AsyncGenerator<T, void, undefined> {
		return paginar(pagina);
	}

	/** Que `console.log(trevol)` o `JSON.stringify(trevol)` no enseñen nada sensible (la llave no se guarda en el objeto, pero por si acaso). */
	toJSON(): { environment: Entorno; apiVersion: string } {
		return { environment: this.environment, apiVersion: this.apiVersion };
	}
}
