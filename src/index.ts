// @trevol/sdk — SDK de Node.js/TypeScript para la API de Trevol. Documentación: https://platform.trevol.si/docs
export { Trevol, type OpcionesTrevol } from './cliente.js';
export {
	TrevolError,
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
	InternalServerError,
	APIConnectionError,
	ConfigurationError,
	WebhookVerificationError,
	type ErrorDeCampo,
	type DatosDeError
} from './errores.js';
export { Webhook, type CabecerasEntrantes, type CuerpoCrudo, type OpcionesWebhook } from './webhooks.js';
export { paginar, type Pagina } from './paginacion.js';
export { decidir, esperaPropia, type Decision, type EntradaDecidir, type Resultado } from './transporte.js';
export { VERSION, API_VERSION } from './generado/tablas.js';
export type { Entorno } from './llave.js';
// Los modelos y las clases de API generados (para tipar tu código).
export * from './generado/models/index.js';
export * from './generado/apis/index.js';
