// El cliente: `new Trevol(llave, opciones)` (docs/api/43 §2.6.1).
import {
	AccountApi,
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
	WebhookEndpointsApi,
	CustomersApi,
	DianDocumentsApi,
	DianSyncsApi,
	InvoiceBatchesApi,
	NumberingAssociationsApi,
	NumberingRangesApi,
	NumberingRequestsApi,
	PaperNumberingRangesApi,
	ProductsApi,
	RadianStatusApi,
	ReportRunsApi,
	ReportsApi
} from './generado/index.js';
import { API_VERSION, VERSION } from './generado/tablas.js';
import { ConfigurationError } from './errores.js';
import { datosDeLaLlave, validarEmpresa, type Entorno, type TipoDeLlave } from './llave.js';
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
	/**
	 * Solo con una llave de administración (`tva_…`): el `com_…` de la empresa en la que trabajan las operaciones de una empresa
	 * (facturas, notas, nómina…). Viaja en `Trevol-Company`, con `Trevol-Environment` según el prefijo de la llave. Para otra empresa
	 * en una sola llamada, `trevol.withCompany('com_…')`.
	 */
	company?: string;
	/** Tu `fetch` (proxies, pruebas). Por defecto el global. */
	fetch?: typeof fetch;
	/** La llave nunca debe ir en un navegador. Solo con esto en `true` se permite (y asumes que la expones). */
	dangerouslyAllowBrowser?: boolean;
	/** Solo para pruebas: el reloj y el azar. */
	internos?: { sleep?: (segundos: number) => Promise<void>; random?: () => number; uuid?: () => string };
}

const URL_BASE = 'https://api.trevol.si/v1';
const SOLO_ADMINISTRACION = 'company solo aplica a una llave de administración (tva_…): una llave tvl_ ya es de una empresa.';

export class Trevol {
	/** `test` (habilitación de la DIAN) o `live` (producción), deducido del prefijo de la llave. */
	readonly environment: Entorno;
	/** `api`: la llave de una empresa (`tvl_…`). `account`: una llave de administración (`tva_…`). */
	readonly keyType: TipoDeLlave;
	/** La empresa (`com_…`) de las operaciones de una empresa con una llave de administración; null si no hay. */
	readonly company: string | null;
	readonly apiVersion: string;

	/** Las operaciones de `/v1/account`: piden una llave de administración (`tva_…`). */
	readonly account: AccountApi;
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
	// La API de noviembre de 2026 (docs/api/34 a 39).
	readonly customers: CustomersApi;
	readonly dianDocuments: DianDocumentsApi;
	readonly dianSyncs: DianSyncsApi;
	readonly invoiceBatches: InvoiceBatchesApi;
	readonly numberingAssociations: NumberingAssociationsApi;
	readonly numberingRanges: NumberingRangesApi;
	readonly numberingRequests: NumberingRequestsApi;
	readonly paperNumberingRanges: PaperNumberingRangesApi;
	readonly products: ProductsApi;
	readonly radianStatus: RadianStatusApi;
	readonly reportRuns: ReportRunsApi;
	readonly reports: ReportsApi;

	// Arma el cliente de otra empresa con la misma llave y las mismas opciones. Es un cierre (no un campo) para que la llave no quede en
	// el objeto: ni console.log, ni JSON.stringify, ni util.inspect la pueden mostrar.
	readonly #derivar: (empresa: string) => Trevol;

	/** @param llave tvl_test_…, tvl_live_… (de una empresa) o tva_test_…, tva_live_… (de administración); si falta se lee `TREVOL_API_KEY`. */
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
		const { tipo, entorno } = datosDeLaLlave(dada);
		this.environment = entorno;
		this.keyType = tipo;
		const prefijo = tipo === 'account' ? 'tva' : 'tvl';
		if (opciones.environment !== undefined && opciones.environment !== this.environment) {
			throw new ConfigurationError(
				`Pediste el entorno «${opciones.environment}» pero la llave es de «${this.environment}»` +
					` (${this.environment === 'test' ? `${prefijo}_test_ = habilitación` : `${prefijo}_live_ = producción`}).`
			);
		}
		if (opciones.company !== undefined && opciones.company !== null) {
			if (tipo === 'api') throw new ConfigurationError(SOLO_ADMINISTRACION);
			this.company = validarEmpresa(opciones.company);
		} else {
			this.company = null;
		}
		const llaveLimpia = dada.trim();
		this.#derivar = (empresa) => new Trevol(llaveLimpia, { ...opciones, company: empresa });
		this.apiVersion = opciones.apiVersion ?? API_VERSION;
		const baseUrl = (opciones.baseUrl ?? URL_BASE).replace(/\/+$/, '');
		const i = opciones.internos ?? {};
		const cargaFetch = opciones.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
		const fetchApi = crearFetch({
			llave: llaveLimpia,
			tipoLlave: tipo,
			entorno,
			empresa: this.company,
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
		this.account = new AccountApi(config);
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
		this.customers = new CustomersApi(config);
		this.dianDocuments = new DianDocumentsApi(config);
		this.dianSyncs = new DianSyncsApi(config);
		this.invoiceBatches = new InvoiceBatchesApi(config);
		this.numberingAssociations = new NumberingAssociationsApi(config);
		this.numberingRanges = new NumberingRangesApi(config);
		this.numberingRequests = new NumberingRequestsApi(config);
		this.paperNumberingRanges = new PaperNumberingRangesApi(config);
		this.products = new ProductsApi(config);
		this.radianStatus = new RadianStatusApi(config);
		this.reportRuns = new ReportRunsApi(config);
		this.reports = new ReportsApi(config);
	}

	/**
	 * Solo con una llave de administración: un cliente para otra empresa, con la misma llave, las mismas opciones y el mismo `fetch`.
	 * Es barato; úsalo por llamada: `await trevol.withCompany('com_…').invoices.listInvoices()`. El cliente original no cambia.
	 */
	withCompany(company: string): Trevol {
		if (this.keyType === 'api') throw new ConfigurationError(SOLO_ADMINISTRACION);
		return this.#derivar(validarEmpresa(company));
	}

	/**
	 * Recorre todas las páginas de un listado: `for await (const f of trevol.paginate((cursor) => trevol.invoices.listInvoices({ limit: 100, startingAfter: cursor }))) { … }`.
	 */
	paginate<T extends { id?: string }>(pagina: (cursor: string | undefined) => Promise<Pagina<T>>): AsyncGenerator<T, void, undefined> {
		return paginar(pagina);
	}

	/** Que `console.log(trevol)` o `JSON.stringify(trevol)` no enseñen nada sensible (la llave no se guarda en el objeto, pero por si acaso). */
	toJSON(): { environment: Entorno; keyType: TipoDeLlave; company: string | null; apiVersion: string } {
		return { environment: this.environment, keyType: this.keyType, company: this.company, apiVersion: this.apiVersion };
	}
}
