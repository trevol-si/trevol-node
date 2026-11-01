import { describe, expect, it } from 'vitest';
import { paginar } from '../src/index.js';
import { cliente, json } from './ayudas.js';

const doc = (n: number) => ({ id: `inv_${n}`, status: 'accepted' });

describe('paginación', () => {
  it('recorre tres páginas falsas con next_cursor y se detiene', async () => {
    const pedidos: Array<string | undefined> = [];
    const paginas = [
      { data: [doc(1), doc(2)], has_more: true, next_cursor: 'inv_2' },
      { data: [doc(3), doc(4)], has_more: true, next_cursor: 'inv_4' },
      { data: [doc(5)], has_more: false, next_cursor: null }
    ];
    const salida: string[] = [];
    for await (const x of paginar(async (c) => { pedidos.push(c); return paginas[pedidos.length - 1]!; })) salida.push(x.id!);
    expect(salida).toEqual(['inv_1', 'inv_2', 'inv_3', 'inv_4', 'inv_5']);
    expect(pedidos).toEqual([undefined, 'inv_2', 'inv_4']);
  });

  it('si has_more viene sin next_cursor, usa el id del último', async () => {
    const pedidos: Array<string | undefined> = [];
    const paginas = [{ data: [doc(1), doc(2)], has_more: true }, { data: [doc(3)], has_more: false }];
    const n: string[] = [];
    for await (const x of paginar(async (c) => { pedidos.push(c); return paginas[pedidos.length - 1]!; })) n.push(x.id!);
    expect(n).toHaveLength(3);
    expect(pedidos).toEqual([undefined, 'inv_2']);
  });

  it('es perezosa: no pide la página 2 hasta necesitarla', async () => {
    let llamadas = 0;
    const it = paginar(async () => { llamadas++; return { data: [doc(1), doc(2)], has_more: true, next_cursor: 'inv_2' }; });
    await it.next();
    expect(llamadas).toBe(1);
    await it.return(undefined);
    expect(llamadas).toBe(1);
  });

  it('una página vacía o un cursor que no avanza no dejan el bucle girando', async () => {
    let n = 0;
    const a: string[] = [];
    for await (const x of paginar(async () => { n++; return { data: [doc(1)], has_more: true, next_cursor: 'inv_1' }; })) a.push(x.id!);
    expect(n).toBeLessThanOrEqual(3);
    for await (const _ of paginar(async () => ({ data: [], has_more: true, next_cursor: 'x' }))) throw new Error('no debe haber elementos');
  });

  it('client.paginate con un método generado y el fetch falso', async () => {
    const { trevol, peticiones } = cliente([
      json(200, { object: 'list', data: [doc(1), doc(2)], has_more: true, next_cursor: 'inv_2' }),
      json(200, { object: 'list', data: [doc(3)], has_more: false, next_cursor: null })
    ]);
    const ids: string[] = [];
    for await (const f of trevol.paginate((cursor) => trevol.invoices.listInvoices({ limit: 2, startingAfter: cursor }))) ids.push(f.id!);
    expect(ids).toEqual(['inv_1', 'inv_2', 'inv_3']);
    expect(new URL(peticiones[0]!.url).searchParams.get('starting_after')).toBeNull();
    expect(new URL(peticiones[1]!.url).searchParams.get('starting_after')).toBe('inv_2');
    expect(new URL(peticiones[1]!.url).searchParams.get('limit')).toBe('2');
  });
});
