// Los fragmentos de la documentación, como programas (docs/api/43 §2.9): se COMPILAN (npm run typecheck los incluye) y se CORREN contra
// Prism. Un fragmento que no compila, o que Prism rechaza porque el cuerpo no cumple la especificación, rompe esta suite.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const URL_PRISM = process.env.TREVOL_PRISM_URL;
const datos = JSON.parse(readFileSync(new URL('../datos/fragmentos.json', import.meta.url), 'utf8'));
const operaciones: string[] = Object.keys(datos.fragmentos);
const carpeta = new URL('./programas/', import.meta.url);

describe('la estructura', () => {
	it('hay un fragmento por operación y por lenguaje, y un programa de arnés por cada uno de node', () => {
		expect(operaciones).toHaveLength(109);
		expect(datos.lenguajes.slice(0, 3)).toEqual(['curl', 'node', 'python']); // los demás SDK suman los suyos después
		for (const op of operaciones) for (const l of datos.lenguajes) expect(datos.fragmentos[op][l], `${op}/${l}`).toBeTruthy();
		expect(readdirSync(carpeta).filter((f) => f.endsWith('.ts')).sort()).toEqual([...operaciones].sort().map((o) => `${o}.ts`));
	});
	it('ningún fragmento lleva un token: la llave es siempre la variable de entorno', () => {
		const todo = JSON.stringify(datos);
		expect(todo).not.toMatch(/tvl_(test|live)_[0-9a-f]{20}/);
		for (const op of operaciones) {
			expect(datos.fragmentos[op].curl).toContain('$TREVOL_API_KEY');
			expect(datos.fragmentos[op].node).toContain('new Trevol()');
		}
	});
});

describe.skipIf(!URL_PRISM)('contra Prism', () => {
	beforeEach(() => void vi.spyOn(console, 'log').mockImplementation(() => {}));
	afterEach(() => vi.restoreAllMocks());

	for (const op of operaciones) {
		it(`node: ${op}`, async () => {
			await import(new URL(`${op}.ts`, carpeta).href);
		});
	}

	describe('curl', () => {
		const dir = mkdtempSync(join(tmpdir(), 'trevol-curl-'));
		afterEach(() => void 0);
		for (const op of operaciones) {
			it(`curl: ${op}`, () => {
				const codigo = (datos.fragmentos[op].curl as string).replace('https://api.trevol.si/v1', URL_PRISM!).replace(/^curl /, 'curl -sS -f -o /dev/null ').replace(/ -o \S+$/, '');
				const r = spawnSync('bash', ['-c', codigo], { cwd: dir, encoding: 'utf8', env: { ...process.env, TREVOL_API_KEY: process.env.TREVOL_API_KEY ?? 'tvl_test_' + 'a1'.repeat(32) } });
				expect(r.stderr, codigo).toBe('');
				expect(r.status, codigo).toBe(0);
			});
		}
		it('limpia', () => void rmSync(dir, { recursive: true, force: true }));
	});
});
