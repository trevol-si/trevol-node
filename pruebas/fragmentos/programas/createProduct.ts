// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.products.createProduct({
  catalogProductInput: {
    external_id: 'ERP-SKU-CAF500',
    code: 'CAF-500',
    name: 'Café especial tostado 500 g',
    unit: '94',
    unit_price: '32000',
    taxes: [{ code: '01', rate: '5' }]
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
