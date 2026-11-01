import { describe, expect, it } from 'vitest';
import { API_VERSION, VERSION } from '../src/index.js';
import { DOCUMENTO, LLAVE_LIVE, LLAVE_TEST, cliente, json } from './ayudas.js';

describe('cabeceras del transporte', () => {
  it('Authorization, Trevol-Version fija, User-Agent y ninguna X-Trevol-*', async () => {
    const { trevol, peticiones } = cliente([json(200, DOCUMENTO)]);
    await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id });
    const c = peticiones[0]!.cabeceras;
    expect(c.get('authorization')).toBe(`Bearer ${LLAVE_TEST}`);
    expect(c.get('trevol-version')).toBe(API_VERSION);
    expect(API_VERSION).toBe('2026-10-22');
    expect(c.get('user-agent')).toMatch(new RegExp(`^trevol-node/${VERSION.replaceAll('.', '\\.')} \\(node v?\\d+.*\\+https://platform\\.trevol\\.si/docs\\)$`));
    expect(c.get('accept')).toBe('application/json, application/problem+json');
    for (const [k] of c) {
      expect(k.startsWith('x-trevol-')).toBe(false);
      expect(['trevol-empresa', 'trevol-entorno', 'trevol-escenario']).not.toContain(k);
    }
  });

  it('apiVersion es configurable y viaja en cada petición', async () => {
    const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], { apiVersion: '2026-10-21' });
    await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id });
    await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id });
    expect(peticiones.map((p) => p.cabeceras.get('trevol-version'))).toEqual(['2026-10-21', '2026-10-21']);
  });

  it('el Accept de una descarga es el del archivo, y el cuerpo binario no se lee como JSON', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70, 0, 255, 1, 2]);
    const { trevol, peticiones } = cliente([new Response(bytes, { status: 200, headers: { 'content-type': 'application/pdf' } })]);
    const pdf = await trevol.invoices.downloadInvoicePdf({ id: DOCUMENTO.id });
    expect(peticiones[0]!.cabeceras.get('accept')).toBe('application/pdf, application/problem+json');
    expect(new Uint8Array(await pdf.arrayBuffer())).toEqual(bytes);
    expect(peticiones[0]!.url).toContain(`/v1/invoices/${DOCUMENTO.id}/pdf`);
  });

  it('la llave live también se usa tal cual', async () => {
    const { trevol, peticiones } = cliente([json(200, DOCUMENTO)], {}, LLAVE_LIVE);
    await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id });
    expect(peticiones[0]!.cabeceras.get('authorization')).toBe(`Bearer ${LLAVE_LIVE}`);
    expect(trevol.environment).toBe('live');
  });

  it('una cabecera Prefer de la persona pasa (así se fuerzan errores contra Prism)', async () => {
    const { trevol, peticiones } = cliente([json(200, DOCUMENTO)]);
    await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }, async ({ init }) => ({ headers: { ...init.headers, Prefer: 'code=404' } }));
    expect(peticiones[0]!.cabeceras.get('prefer')).toBe('code=404');
  });
});
