# @trevol/sdk

SDK de Node.js y TypeScript para la **API de Trevol**: facturación electrónica, documento soporte, documento equivalente, nómina
electrónica y eventos RADIAN ante la DIAN (Colombia). Documentación: <https://platform.trevol.si/docs>.

> **In English.** Node.js/TypeScript SDK for the Trevol API (Colombian e-invoicing, DIAN). ESM, Node ≥ 22.12, one runtime dependency
> (`standardwebhooks`). Fully typed models generated from the OpenAPI spec (OpenAPI Generator), plus a thin hand-written layer: automatic
> `Idempotency-Key` (the same one on retries), retries with exponential backoff honouring `Retry-After`, typed errors by problem+json `code`,
> environment inferred from the key prefix (`tvl_test_` = DIAN test environment, `tvl_live_` = production), pinned `Trevol-Version`,
> Standard Webhooks signature verification, cursor pagination iterators and PDF/XML/ZIP downloads. Account keys (`tva_test_`/`tva_live_`)
> manage several companies: `trevol.account.*`, and `company` / `withCompany()` for company operations. Docs are in Spanish like the API.

**Versión 0.3.0** (sin publicar) — API `2026-11-18`. Licencia MIT.

## Instalación

```sh
npm install @trevol/sdk
```

Necesita Node.js 22.12 o más nuevo (ESM; con `require(esm)` también lo puedes usar desde CommonJS). La única dependencia es
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks).

## Uso

La llave de la API se crea en la consola de desarrolladores (<https://platform.trevol.si/llaves>) y se guarda en el entorno de tu **servidor**:
`TREVOL_API_KEY`. Una llave `tvl_test_…` llama a la habilitación de la DIAN; una `tvl_live_…`, a producción. El SDK deduce el entorno del
prefijo (`trevol.environment`) y se niega a correr en un navegador.

```ts
import { Trevol, TrevolError, ValidationError, Webhook } from '@trevol/sdk';

const trevol = new Trevol(process.env.TREVOL_API_KEY); // tvl_test_… → trevol.environment === 'test'

try {
	const factura = await trevol.invoices.createInvoice({
		invoiceInput: {
			external_id: 'VENTA-2026-000123',
			customer: { final_consumer: true },
			items: [{ description: 'Café especial 500 g', quantity: '1', unit_price: '32000', taxes: [{ code: '01', rate: '19' }] }],
			payment: { form: 'cash', methods: [{ code: '10' }] }
		},
		idempotencyKey: 'VENTA-2026-000123' // opcional: si falta, el SDK pone una y la repite en los reintentos
	});
	if (factura.status === 'processing') {
		// 202: la DIAN no contestó; Trevol lo termina y avisa por webhook. NO crees otro documento para la misma venta.
	}
} catch (e) {
	if (e instanceof ValidationError) for (const x of e.errors) console.error(x.pointer, x.message);
	else if (e instanceof TrevolError) console.error(e.code, e.requestId);
	else throw e;
}

// Todas las páginas de un listado, perezosamente
for await (const f of trevol.paginate((cursor) => trevol.invoices.listInvoices({ limit: 100, startingAfter: cursor }))) {
	console.log(f.id, f.status);
}

// Los archivos llegan como Blob
const pdf = await trevol.invoices.downloadInvoicePdf({ id: 'inv_…' });

// Un webhook: verifica sobre el CUERPO CRUDO
const evento = new Webhook(process.env.TREVOL_WEBHOOK_SECRET!).verify(cuerpoCrudo, req.headers);
```

Los nombres de los métodos y de los parámetros son los del `operationId` de la [especificación](https://platform.trevol.si/docs/api)
(`createInvoice`, `listInvoices`, `retrieveInvoice`, `correctInvoice`, `sendInvoice`, `downloadInvoicePdf`…). Los campos del cuerpo se
escriben **igual que en la API** (`external_id`, no `externalId`), y los importes y las fechas viajan como texto (`'32000.50'`,
`'2026-10-31'`).

## Llave de administración

Si llevas varias empresas en tu cuenta, una llave de administración (`tva_test_…` o `tva_live_…`, la crea el titular en la consola)
sirve para todas: `trevol.account` ve tus empresas, reserva empresas nuevas, crea y revoca las llaves de cada una y lista lo emitido, lo
recibido y los eventos RADIAN de todas. Con el permiso `documents:write` también emite en ellas: indica la empresa con `company` o, por
llamada, con `withCompany`. El SDK manda `Trevol-Company` y `Trevol-Environment` (el del prefijo de la llave: `tva_test_` es habilitación,
`tva_live_` producción) y, si falta la empresa, lanza `ConfigurationError` antes de llamar.

```ts
const admin = new Trevol(); // lee TREVOL_API_KEY: tva_live_… → admin.keyType === 'account'

for await (const empresa of admin.paginate((cursor) => admin.account.listAccountCompanies({ status: 'enabled', startingAfter: cursor }))) {
	console.log(empresa.id, empresa.name);
}

// Emitir en una empresa (el com_… sale de la lista de arriba; invoiceInput, como en el ejemplo de Uso)
const factura = await admin.withCompany('com_3f0c9a1e5b2d4c7f8a6e1d2c3b4a5f60').invoices.createInvoice({ invoiceInput });

// Una llave para el ERP de esa empresa: el token sale una sola vez
const llave = await admin.account.createAccountCompanyApiKey({
	id: 'com_3f0c9a1e5b2d4c7f8a6e1d2c3b4a5f60',
	accountApiKeyInput: { name: 'ERP de la bodega', permissions: 'write' }
});
```

- Las operaciones de `account` solo aceptan una llave de administración; con una `tvl_` el SDK lanza `ConfigurationError` sin llamar.
  `company` y `withCompany` solo aplican a una `tva_` (una `tvl_` ya es de una empresa).
- Reservar empresas (`createAccountCompany`) pide una llave `tva_live_` que alcance todas tus empresas. La consola no deja darle
  `companies:write` a una `tva_test_` ni a una llave con lista de empresas, así que con esas la respuesta es `PermissionDeniedError`
  con `problem.required_permission === 'companies:write'`. Los `problem.reason` `live_mode_required` y `scope_list` solo salen si una
  llave así tuviera ese permiso.
- Si `createAccountCompanyApiKey` se repite con la misma `Idempotency-Key`, la respuesta trae la misma llave con `token: null`: el token
  solo sale la primera vez. Si lo perdiste, revoca esa llave (`revokeAccountCompanyApiKey`) y crea otra.
- Errores propios: `ConflictError` con `code` `company_exists` (la empresa está en `error.problem.company`) o `key_limit_reached`;
  `RateLimitError` con `company_limit_reached` (y `retryAfter`); `PermissionDeniedError` con `problem.reason` (`environment_mismatch`,
  `live_mode_required`, `scope_list`) o `problem.required_permission`.

## Lo que conviene saber

### Idempotencia: manda `external_id` y tu propia clave

El SDK genera una `Idempotency-Key` por llamada y **la repite en todos los reintentos de esa llamada**. Pero si tu proceso muere y vuelves a
llamar, saldrá otra clave y, si no mandaste `external_id` (es opcional), podría duplicarse el documento. Por eso:

- manda siempre `external_id` (tu id de la venta), y
- pasa una `idempotencyKey` derivada de tu venta (`idempotencyKey: 'VENTA-2026-000123'`).

Ante un `ConflictError` con `code === 'external_id_in_use'`, el documento ya existe: usa `error.problem.existing_id`. Todo error lleva la
`idempotencyKey` que se usó (`error.idempotencyKey`) para reintentar más tarde con la misma. Un `APIConnectionError` también.

### Respuestas 202 (`processing`, `sending`, `validating`, `contingency`)

No son errores ni se reintentan: se devuelven como el modelo de la respuesta. **No crees otro documento**: espera el webhook o consulta con
`retrieveInvoice`; repetir la misma llamada con la misma `Idempotency-Key` continúa el mismo documento. El PDF y el ZIP llegan después del
`201` (evento `invoice.delivered`, o `delivery.status === 'completed'`).

### Reintentos

Hasta 2 reintentos (3 intentos) con espera creciente (0,5 s, 1 s, 2 s… con tope de 8 s y un poco de azar) ante un error de red, 429, 500,
502, 503, 504, un 409 `request_in_progress` o `previous_event_pending`, y todo problema que diga `retryable: true` (salvo el 402). Respeta
`Retry-After`; si pide más de `maxRetryAfter` (60 s) no espera y lanza el error con `error.retryAfter`. Las operaciones sin
`Idempotency-Key` (crear un endpoint, `…/send`, `DELETE`) solo se reintentan con 429. Los 202 y los errores finales (400, 401, 402, 403, 404,
422 y los 409 `invalid_state`, `external_id_in_use`, `duplicate_document`) **nunca** se reintentan.

### La versión de la API

El SDK fija `Trevol-Version: 2026-11-18` en cada petición. **Ojo:** una llave de una versión anterior que empiece a usar este SDK
pasa a `2026-11-18` (el encabezado manda): un `422 validation_error` trae todos los problemas de los datos juntos en `errors`, no solo el
primero, y si la llave estaba en `2026-10-21`, recibe `202 processing` donde antes recibía `503`. Si todavía no quieres ese cambio, fija
la versión que usabas: `new Trevol(llave, { apiVersion: '2026-10-22' })`. Más en <https://platform.trevol.si/docs/versiones>.

### Errores tipados

`TrevolError` es la base; las clases salen del `code` del problem+json: `AuthenticationError`, `PermissionDeniedError`, `NotFoundError`,
`InvalidRequestError`, `IdempotencyError`, `ValidationError` (con `errors[]`: `field`, `pointer`, `message`), `ConflictError`,
`PreconditionError`, `DianRejectedError` (con `problem.document` y `problem.rules`), `BalanceError`, `RateLimitError`,
`DianUnavailableError` e `InternalServerError`. Un `code` que el SDK todavía no conoce llega como `TrevolError` con ese `code`: nunca
rompe. Además: `APIConnectionError` (no hubo respuesta), `ConfigurationError` (mal uso, antes de llamar) y `WebhookVerificationError`.
Cada error tiene `status`, `code`, `type`, `title`, `detail`, `requestId`, `retryable`, `retryAfter`, `errors`, `idempotencyKey`, `problem`
(el cuerpo completo) y `headers` (los de la respuesta). Ninguno incluye tu llave.

### Webhooks

```ts
import express from 'express';
import { Webhook, WebhookVerificationError } from '@trevol/sdk';

const wh = new Webhook(process.env.TREVOL_WEBHOOK_SECRET!); // whsec_…
app.post('/webhooks/trevol', express.raw({ type: 'application/json' }), (req, res) => {
	try {
		const evento = wh.verify(req.body, req.headers); // req.body es un Buffer: el cuerpo CRUDO
		// Deduplica por el id del evento (también llega en la cabecera `webhook-id`): la verificación no evita repeticiones.
		const datos = wh.eventData(evento); // el modelo según evento.type (p. ej. DocumentEventData)
		res.sendStatus(200);
	} catch (e) {
		if (e instanceof WebhookVerificationError) return res.sendStatus(400);
		throw e;
	}
});
```

La firma se calcula sobre los **bytes exactos**: no uses `express.json()` antes (en Next.js, SvelteKit o Hono lee `await request.text()`).
`verify` acepta `Headers` de `fetch`, el objeto de Node, un `Map`, y el cuerpo como `string`, `Buffer`, `Uint8Array` o `ArrayBuffer`;
tolera 5 minutos hacia atrás y hacia adelante en `webhook-timestamp`.

### Estado y cabeceras de la respuesta

Cada método tiene una variante `…Raw` que devuelve la respuesta de `fetch`: `const r = await trevol.invoices.createInvoiceRaw({ … });
r.raw.headers.get('request-id'); r.raw.headers.get('idempotent-replayed'); const factura = await r.value();`.

### Cabeceras o `signal` propios por llamada

El segundo argumento de cada método (`initOverrides`) se mezcla con la petición. **Ojo:** si pasas `{ headers }` reemplazas todas las cabeceras
(incluida `Content-Type`); para añadir una usa la forma de función: `trevol.invoices.listInvoices({}, async ({ init }) => ({ headers: { ...init.headers, 'X-Mi-Cabecera': '…' } }))`.
Un `{ signal }` para cancelar sí se puede pasar directo.

## Opciones

```ts
new Trevol(llave, {
	apiVersion: '2026-11-18', // Trevol-Version en cada petición
	maxRetries: 2, // 0 los apaga
	timeout: 65, // segundos por intento
	maxRetryAfter: 60, // segundos
	baseUrl: 'https://api.trevol.si/v1',
	environment: 'test', // si la llave no coincide: ConfigurationError antes de llamar
	company: 'com_…', // solo con una llave de administración: la empresa de las operaciones de una empresa
	fetch: miFetch, // proxies, pruebas
	dangerouslyAllowBrowser: false // la llave nunca debe ir en un navegador
});
```

## Cómo está hecho

- `src/generado/` lo escribe [OpenAPI Generator](https://openapi-generator.tech) 7.26.0 (`typescript-fetch`) desde la especificación pública y
  **no se edita** (ver `GENERADO.md`). Con la opción `stringEnums: false` cada enum es un objeto `as const` más un tipo de unión de
  literales: `form: 'cash'` compila.
- Lo propio (`src/cliente.ts`, `transporte.ts`, `errores.ts`, `paginacion.ts`, `webhooks.ts`) vive fuera y solo usa los puntos de extensión
  del código generado (`Configuration.fetchApi`).
- Las pruebas: `npm run typecheck && npm test` (unitarias sin red, con los mismos casos de los demás SDK en `pruebas/datos/`);
  `TREVOL_PRISM_URL=http://127.0.0.1:4010 npm run test:prism` contra un servidor simulado
  (`npx @stoplight/prism-cli mock pruebas/datos/openapi.json -p 4010`) que valida cada petición contra la especificación, y que además
  corre como programa cada fragmento de código de la documentación.
- `npm run humo` es la prueba de humo **real** (solo con una llave `tvl_test_`; con `TREVOL_HUMO_EMITIR=1` emite una factura en
  habilitación; con `TREVOL_HUMO_ADMIN_KEY=tva_test_…` además hace lecturas con una llave de administración).

## Licencia

MIT © 2026 Joshua Montclair (Trevol).
