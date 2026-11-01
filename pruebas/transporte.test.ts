import { describe, expect, it } from 'vitest';
import { decidir, esperaPropia, type Resultado } from '../src/index.js';
import { datos } from './ayudas.js';

interface Caso {
	nombre: string;
	reintento: 'seguro' | 'solo_429';
	intento: number;
	maxReintentos: number;
	maxRetryAfter: number;
	azar: number;
	resultado: Resultado;
	esperado: { reintentar: boolean; espera?: number; motivo?: string };
}

const casos: Caso[] = datos('transporte.json').casos;

describe('decidir (pruebas/datos/transporte.json, las mismas en los 7 SDK)', () => {
	it('hay casos', () => expect(casos.length).toBeGreaterThanOrEqual(50));
	for (const c of casos) {
		it(c.nombre, () => {
			const d = decidir({ intento: c.intento, reintento: c.reintento, maxReintentos: c.maxReintentos, maxRetryAfter: c.maxRetryAfter, azar: c.azar, resultado: c.resultado });
			expect(d.reintentar).toBe(c.esperado.reintentar);
			if (c.esperado.espera !== undefined) expect(d.espera).toBeCloseTo(c.esperado.espera, 9);
			if (c.esperado.motivo !== undefined) expect(d.motivo).toBe(c.esperado.motivo);
			if (!c.esperado.reintentar) expect(d.espera).toBeUndefined();
		});
	}
});

describe('la espera propia', () => {
	it('crece 0,5 · 2^(n−1) con tope de 8 y un factor entre 0,75 y 1', () => {
		expect([1, 2, 3, 4, 5, 6, 9].map((n) => esperaPropia(n, 1))).toEqual([0.5, 1, 2, 4, 8, 8, 8]);
		expect(esperaPropia(1, 0)).toBe(0.375);
		expect(esperaPropia(4, 0)).toBe(3);
	});
});
