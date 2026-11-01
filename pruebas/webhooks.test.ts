import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Buffer } from 'node:buffer';
import { ConfigurationError, Webhook, WebhookVerificationError } from '../src/index.js';
import { datos } from './ayudas.js';

interface Caso {
  nombre: string; secreto: string; cuerpo: string; cabeceras: Record<string, string>; ahora: number; valido: boolean;
  evento?: { id: string; type: string }; motivo?: string;
}
const { casos, tolerancia } = datos<{ casos: Caso[]; tolerancia: number }>('webhooks.json');

describe('Webhook.verify con los vectores de pruebas/datos/webhooks.json (firmados por trevol_dian.webhooks.firmar)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('la tolerancia es de 5 minutos', () => expect(tolerancia).toBe(300));
  for (const c of casos) {
    it(c.nombre, () => {
      vi.setSystemTime(c.ahora * 1000);
      const wh = new Webhook(c.secreto);
      if (c.valido) {
        const e = wh.verify(c.cuerpo, c.cabeceras);
        expect(e.id).toBe(c.evento!.id);
        expect(e.type).toBe(c.evento!.type);
      } else {
        let err: unknown;
        try { wh.verify(c.cuerpo, c.cabeceras); } catch (x) { err = x; }
        expect(err).toBeInstanceOf(WebhookVerificationError);
        expect((err as WebhookVerificationError).motivo).toBe(c.motivo);
      }
    });
  }
});

describe('Webhook.verify: formas de recibir el cuerpo y las cabeceras (C15)', () => {
  const ok = casos.find((c) => c.nombre === 'valido')!;
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(ok.ahora * 1000); });
  afterEach(() => vi.useRealTimers());
  const wh = () => new Webhook(ok.secreto);

  it('un Headers de fetch (Next.js, SvelteKit, Hono, Workers, Deno, Bun)', () => {
    expect(wh().verify(ok.cuerpo, new Headers(ok.cabeceras)).type).toBe('invoice.accepted');
  });
  it('un objeto de Node con valores en arreglo y nombres en cualquier caja', () => {
    const h = { 'Webhook-Id': [ok.cabeceras['webhook-id']!], 'WEBHOOK-TIMESTAMP': ok.cabeceras['webhook-timestamp'], 'webhook-signature': [ok.cabeceras['webhook-signature']!, 'otra'] };
    expect(wh().verify(ok.cuerpo, h).type).toBe('invoice.accepted');
  });
  it('un Map', () => {
    expect(wh().verify(ok.cuerpo, new Map(Object.entries(ok.cabeceras))).type).toBe('invoice.accepted');
  });
  it('Buffer, Uint8Array y ArrayBuffer', () => {
    const bytes = Buffer.from(ok.cuerpo, 'utf8');
    expect(wh().verify(bytes, ok.cabeceras).type).toBe('invoice.accepted');
    expect(wh().verify(new Uint8Array(bytes), ok.cabeceras).type).toBe('invoice.accepted');
    expect(wh().verify(new Uint8Array(bytes).buffer, ok.cabeceras).type).toBe('invoice.accepted');
  });
  it('un cuerpo ya parseado se rechaza diciendo cómo leer el crudo', () => {
    let err: unknown;
    try { wh().verify(JSON.parse(ok.cuerpo) as never, ok.cabeceras); } catch (x) { err = x; }
    expect(err).toBeInstanceOf(WebhookVerificationError);
    expect((err as Error).message).toMatch(/CRUDO/);
    expect((err as Error).message).toMatch(/express\.raw|request\.text/);
  });
  it('una cabecera repetida usa la primera', () => {
    const h = { 'webhook-id': [ok.cabeceras['webhook-id']!, 'evt_otro'], 'webhook-timestamp': ok.cabeceras['webhook-timestamp'], 'webhook-signature': ok.cabeceras['webhook-signature'] };
    expect(wh().verify(ok.cuerpo, h).type).toBe('invoice.accepted');
  });
  it('un secreto vacío o con basura es ConfigurationError, y no se filtra', () => {
    expect(() => new Webhook('')).toThrow(ConfigurationError);
    expect(() => new Webhook('whsec_@@@')).toThrow(ConfigurationError);
  });
  it('eventData da el modelo según el type; un type nuevo da undefined', () => {
    const e = wh().verify(ok.cuerpo, ok.cabeceras);
    const d = wh().eventData(e) as { id?: string; status?: string };
    expect(d.status).toBe('accepted');
    expect(wh().eventData({ ...e, type: 'invoice.archived' as never })).toBeUndefined();
  });
  it('el mensaje de un rechazo no incluye el secreto', () => {
    let err: unknown;
    try { new Webhook(casos[0]!.secreto).verify(ok.cuerpo + ' ', ok.cabeceras); } catch (x) { err = x; }
    expect(String(err)).not.toContain(ok.secreto.slice(6));
  });
});
