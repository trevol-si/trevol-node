import { describe, expect, it } from 'vitest';
import * as sdk from '../src/index.js';
import { TrevolError } from '../src/index.js';
import { datos, cliente, problema, DOCUMENTO, LLAVE_TEST } from './ayudas.js';

const errores = datos<{ clases: Record<string, string[]>; estados: Record<string, string> }>('errores.json');
const todos = Object.entries(errores.clases).flatMap(([clase, codes]) => codes.map((code) => [clase, code] as const));
const ESTADO: Record<string, number> = {
  AuthenticationError: 401, PermissionDeniedError: 403, NotFoundError: 404, InvalidRequestError: 400, IdempotencyError: 409,
  ValidationError: 422, ConflictError: 409, PreconditionError: 422, DianRejectedError: 422, BalanceError: 402, RateLimitError: 429,
  DianUnavailableError: 503, InternalServerError: 500
};

describe('errores tipados a través de un método generado', () => {
  it('cubre los 30 code', () => expect(todos).toHaveLength(30));
  for (const [clase, code] of todos) {
    it(`${code} → ${clase}`, async () => {
      // retryable false y sin reintentos: el error sale de la primera respuesta
      const { trevol } = cliente([problema(ESTADO[clase]!, code, { retryable: false })], { maxReintentos: 0 });
      const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
      const Clase = (sdk as unknown as Record<string, new (...a: never[]) => TrevolError>)[clase]!;
      expect(e).toBeInstanceOf(Clase);
      expect(e).toBeInstanceOf(TrevolError);
      expect(e).toBeInstanceOf(Error);
      expect(e.constructor.name).toBe(clase);
      expect(e.code).toBe(code);
      expect(e.status).toBe(ESTADO[clase]);
      expect(e.requestId).toBe('req_' + 'c3'.repeat(12));
      expect(e.type).toBe(`https://platform.trevol.si/docs/errores#${code}`);
      expect(e.problem?.code).toBe(code);
    });
  }

  it('el error NO se envuelve en FetchError/ResponseError del código generado', async () => {
    const { trevol } = cliente([problema(404, 'not_found')]);
    const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
    expect(e.name).toBe('NotFoundError');
    expect(e.constructor.name).not.toMatch(/FetchError|ResponseError/);
  });

  it('un code desconocido es la clase base y no rompe', async () => {
    const { trevol } = cliente([problema(422, 'code_del_futuro')]);
    const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
    expect(e.constructor).toBe(TrevolError);
    expect(e.code).toBe('code_del_futuro');
  });

  it('una respuesta que no es JSON (HTML de un proxy) da la clase por estado, con code null y el cuerpo recortado a 2 KB', async () => {
    const html = '<html>' + 'x'.repeat(5000) + '</html>';
    const casos: Array<[number, string]> = [[502, 'InternalServerError'], [404, 'NotFoundError'], [409, 'ConflictError'], [401, 'AuthenticationError']];
    for (const [estado, clase] of casos) {
      const { trevol } = cliente([new Response(html, { status: estado, headers: { 'content-type': 'text/html' } })], { maxReintentos: 0 });
      const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
      expect(e.constructor.name).toBe(clase);
      expect(e.code).toBeNull();
      expect(e.detail!.length).toBe(2048);
    }
  });

  it('toma el request-id de la cabecera cuando el cuerpo no lo trae', async () => {
    const { trevol } = cliente([new Response(JSON.stringify({ type: 'x', title: 't', status: 404, code: 'not_found', retryable: false }), { status: 404, headers: { 'request-id': 'req_' + 'd4'.repeat(12) } })]);
    const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
    expect(e.requestId).toBe('req_' + 'd4'.repeat(12));
  });

  it('ValidationError trae errors[] con field, pointer y message', async () => {
    const { trevol } = cliente([problema(422, 'validation_error', { errors: [{ field: 'items', pointer: '/items', message: 'Falta' }] })]);
    const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
    expect(e.errors).toEqual([{ field: 'items', pointer: '/items', message: 'Falta' }]);
  });

  it('DianRejectedError y ConflictError conservan los campos extra en problem', async () => {
    const { trevol } = cliente([problema(409, 'external_id_in_use', { existing_id: 'inv_x' })]);
    const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
    expect(e.problem.existing_id).toBe('inv_x');
  });

  it('la llave no aparece en toString, message, JSON ni util.inspect de ningún error', async () => {
    const { trevol } = cliente([problema(401, 'invalid_api_key')]);
    const e = await trevol.invoices.retrieveInvoice({ id: DOCUMENTO.id }).catch((x) => x);
    const { inspect } = await import('node:util');
    for (const t of [String(e), e.message, JSON.stringify(e), inspect(e, { depth: 6 }), inspect(trevol, { depth: 8 }), JSON.stringify(trevol)]) {
      expect(t).not.toContain(LLAVE_TEST);
      expect(t).not.toContain('a1'.repeat(32));
    }
    expect(String(e)).toContain('invalid_api_key');
    expect(String(e)).toContain('HTTP 401');
    expect(String(e)).toContain('req_');
  });
});
