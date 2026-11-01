import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigurationError, Trevol } from '../src/index.js';
import { LLAVE_LIVE, LLAVE_TEST } from './ayudas.js';

describe('la llave y el entorno', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('tvl_test_ → test; tvl_live_ → live', () => {
    expect(new Trevol(LLAVE_TEST).environment).toBe('test');
    expect(new Trevol(LLAVE_LIVE).environment).toBe('live');
  });
  it('lee TREVOL_API_KEY si no se pasa', () => {
    vi.stubEnv('TREVOL_API_KEY', LLAVE_LIVE);
    expect(new Trevol().environment).toBe('live');
  });
  it('sin llave y sin variable: error de configuración', () => {
    vi.stubEnv('TREVOL_API_KEY', '');
    expect(() => new Trevol()).toThrow(ConfigurationError);
  });
  it('mal formada → ConfigurationError, sin red y sin la llave en el mensaje', () => {
    const malas = ['tvl_test_abc', 'tvl_prod_' + 'a1'.repeat(32), 'sk_live_' + 'a1'.repeat(32), 'tvl_test_' + 'A1'.repeat(32), 'tvl_test_' + 'a1'.repeat(33), '   ', 'tvl_test_' + 'zz'.repeat(32)];
    for (const k of malas) {
      let e: unknown;
      try { new Trevol(k, { fetch: (() => { throw new Error('no debe llamar'); }) as never }); } catch (x) { e = x; }
      expect(e).toBeInstanceOf(ConfigurationError);
      expect(String((e as Error).message)).not.toContain(k.trim() || 'xx-vacio');
      expect(String(e)).not.toContain('zz'.repeat(32));
    }
  });
  it('environment que no coincide con la llave → ConfigurationError antes de llamar', () => {
    expect(() => new Trevol(LLAVE_TEST, { environment: 'live' })).toThrow(ConfigurationError);
    expect(() => new Trevol(LLAVE_LIVE, { environment: 'test' })).toThrow(/live/);
    expect(new Trevol(LLAVE_TEST, { environment: 'test' }).environment).toBe('test');
  });
  it('en un navegador (window y document) se niega, salvo dangerouslyAllowBrowser', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('document', {});
    expect(() => new Trevol(LLAVE_TEST)).toThrow(/navegador/);
    expect(new Trevol(LLAVE_TEST, { dangerouslyAllowBrowser: true }).environment).toBe('test');
    vi.unstubAllGlobals();
  });
});
