import { describe, expect, it } from 'vitest';
import { ConfigurationError } from '../src/index.js';
import { DOCUMENTO, ENTRADA_FACTURA, cliente, json, problema } from './ayudas.js';

describe('Idempotency-Key', () => {
  it('genera UNA clave y la repite en los tres intentos (dos fallos y un acierto)', async () => {
    const { trevol, peticiones } = cliente([problema(503, 'dian_unavailable', { retryable: true }), problema(503, 'dian_unavailable', { retryable: true }), json(201, DOCUMENTO)]);
    await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA });
    expect(peticiones).toHaveLength(3);
    const claves = peticiones.map((p) => p.cabeceras.get('idempotency-key'));
    expect(new Set(claves).size).toBe(1);
    expect(claves[0]).toBe('00000000-0000-4000-8000-000000000001');
    // y el cuerpo viaja entero en cada intento (el reintento no lee un cuerpo ya consumido)
    expect(new Set(peticiones.map((p) => p.cuerpo)).size).toBe(1);
    expect(JSON.parse(peticiones[2]!.cuerpo!).external_id).toBe('VENTA-2026-000123');
  });

  it('respeta la clave de la persona', async () => {
    const { trevol, peticiones } = cliente([json(201, DOCUMENTO)]);
    await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA, idempotencyKey: 'VENTA-2026-000123' });
    expect(peticiones[0]!.cabeceras.get('idempotency-key')).toBe('VENTA-2026-000123');
  });

  it('una clave mala se rechaza localmente, sin red', async () => {
    const { trevol, peticiones } = cliente([json(201, DOCUMENTO)]);
    await expect(trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA, idempotencyKey: 'con espacio' })).rejects.toBeInstanceOf(ConfigurationError);
    await expect(trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA, idempotencyKey: 'x'.repeat(256) })).rejects.toBeInstanceOf(ConfigurationError);
    expect(peticiones).toHaveLength(0);
  });

  it('la lleva el error para reintentar más tarde con la misma', async () => {
    const { trevol } = cliente([problema(422, 'dian_rejected')]);
    const e = await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA }).catch((x) => x);
    expect(e.idempotencyKey).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('crear, corregir y la recarga la llevan; leer, enviar y los endpoints no', async () => {
    const { trevol, peticiones } = cliente([json(200, DOCUMENTO)]);
    await trevol.invoices.createInvoice({ invoiceInput: ENTRADA_FACTURA });
    await trevol.invoices.correctInvoice({ id: DOCUMENTO.id, invoiceInput: ENTRADA_FACTURA });
    await trevol.balance.createBalanceTopUp({ topUpInput: { amount_cop: 50000 } as any });
    await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id });
    await trevol.invoices.sendInvoice({ id: DOCUMENTO.id });
    await trevol.webhookEndpoints.createWebhookEndpoint({ webhookEndpointInput: { url: 'https://tu-servidor.co/h', events: ['*'] } as any });
    await trevol.invoices.previewInvoice({ invoiceInput: ENTRADA_FACTURA });
    expect(peticiones.map((p) => `${p.metodo} ${new URL(p.url).pathname} ${p.cabeceras.has('idempotency-key')}`)).toEqual([
      'POST /v1/invoices true',
      `PUT /v1/invoices/${DOCUMENTO.id} true`,
      'POST /v1/balance/top_ups true',
      `GET /v1/invoices/${DOCUMENTO.id} false`,
      `POST /v1/invoices/${DOCUMENTO.id}/send false`,
      'POST /v1/webhook_endpoints false',
      'POST /v1/invoices/preview false'
    ]);
  });
});
