// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.paperNumberingRanges.createPaperNumberingRange({
  paperNumberingRangeInput: {
    resolution_number: '18764000004521',
    prefix: 'TP',
    from: 1,
    to: 5000,
    valid_from: '2026-01-15',
    valid_to: '2028-01-15'
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
