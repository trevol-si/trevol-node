// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.equivalentDocumentAdjustments.correctEquivalentDocumentAdjustment({
  id: 'posa_3f0c1a2b3f0c1a2b3f0c1a2b3f0c1a2b',
  equivalentDocumentAdjustmentInput: {
    external_id: 'TIQ-1-DEV',
    note_type: 'credit',
    concept: '1',
    equivalent_document: { id: 'pos_3f0c1a2b3f0c1a2b3f0c1a2b3f0c1a2b' },
    items: [
      {
        description: 'Devolución gaseosa',
        unit: '94',
        quantity: '1',
        unit_price: '3000',
        taxes: [{ code: '01', rate: '19' }]
      }
    ]
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
