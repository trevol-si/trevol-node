import { describe, expect, it } from 'vitest';
import { Trevol } from '../src/index.js';
import { ETIQUETAS, OPERACIONES } from '../src/generado/tablas.js';
import { datos, LLAVE_TEST } from './ayudas.js';

const minuscula = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

describe('cobertura de recursos', () => {
  const cliente = new Trevol(LLAVE_TEST) as unknown as Record<string, Record<string, unknown>>;
  const etiquetas: string[] = datos('tags.json');
  it('la tabla generada y la especificación tienen las mismas etiquetas', () => expect([...ETIQUETAS]).toEqual(etiquetas));
  it('cada etiqueta de openapi.sdk.json tiene su propiedad en el cliente (si la API suma un recurso, esto falla hasta agregarlo)', () => {
    for (const etiqueta of etiquetas) expect(cliente[minuscula(etiqueta)], etiqueta).toBeDefined();
  });
  it('cada operationId existe como método en la clase de su etiqueta', () => {
    for (const o of OPERACIONES) expect(typeof cliente[minuscula(o.recurso)]![o.operationId], o.operationId).toBe('function');
  });
});
