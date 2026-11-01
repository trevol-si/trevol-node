import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as sdk from '../src/index.js';
import { Webhook } from '../src/index.js';
import { cliente, datos, json } from './ayudas.js';

interface Caso {
  nombre: string; operacion?: string; estado?: number; cabeceras?: Record<string, string>; cuerpo?: any;
  evento?: any; esperado: Record<string, any>;
}
const { casos } = datos<{ casos: Caso[] }>('respuestas-futuras.json');

describe('respuestas del futuro: no rompen a quien ya integró', () => {
  for (const c of casos.filter((x) => x.operacion)) {
    it(c.nombre, async () => {
      const respuesta = new Response(JSON.stringify(c.cuerpo), { status: c.estado, headers: { 'content-type': c.estado! >= 400 ? 'application/problem+json' : 'application/json', ...c.cabeceras } });
      const { trevol } = cliente([respuesta], { maxReintentos: 0 });
      const llamada = c.operacion === 'listInvoices' ? () => trevol.invoices.listInvoices({}) : () => trevol.invoices.retrieveInvoice({ id: 'inv_x' });
      if (c.estado! < 400) {
        const r: any = await llamada();
        if (c.esperado.cantidad !== undefined) { expect(r.data).toHaveLength(c.esperado.cantidad); expect(r.has_more).toBe(c.esperado.has_more); }
        else { expect(r.id).toBe(c.esperado.id); expect(r.status).toBe(c.esperado.status); }
      } else {
        const e: any = await llamada().catch((x) => x);
        expect(e).toBeInstanceOf(sdk.TrevolError);
        expect(e.constructor.name).toBe(c.esperado.clase);
        expect(e.code).toBe(c.esperado.code);
        expect(e.status).toBe(c.esperado.status);
        if (c.esperado.requestId) expect(e.requestId).toBe(c.esperado.requestId);
      }
    });
  }

  describe('eventos', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    for (const c of casos.filter((x) => x.evento)) {
      it(c.nombre, async () => {
        // se firma con el mismo algoritmo (HMAC-SHA256, Standard Webhooks) para llegar a eventData
        const { createHmac } = await import('node:crypto');
        const secreto = 'whsec_' + Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
        const ts = 1793491200;
        vi.setSystemTime(ts * 1000);
        const cuerpo = JSON.stringify(c.evento);
        const firma = 'v1,' + createHmac('sha256', Buffer.from('0123456789abcdef0123456789abcdef')).update(`${c.evento.id}.${ts}.${cuerpo}`).digest('base64');
        const wh = new Webhook(secreto);
        const e = wh.verify(cuerpo, { 'webhook-id': c.evento.id, 'webhook-timestamp': String(ts), 'webhook-signature': firma });
        expect(e.type).toBe(c.esperado.type);
        expect(wh.eventData(e) !== undefined).toBe(c.esperado.tieneModelo);
        expect(e.data).toEqual(c.evento.data);
      });
    }
  });
});
