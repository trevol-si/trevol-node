// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.supportDocumentAdjustments.correctSupportDocumentAdjustment({
  id: 'sda_3f0c1a2b3f0c1a2b3f0c1a2b3f0c1a2b',
  supportDocumentAdjustmentInput: {
    external_id: 'OC-991-ANULA',
    concept: '2',
    description: 'Anulación: la compra de leche se registró dos veces en el ERP',
    support_document: { id: 'sd_3f0c1a2b3f0c1a2b3f0c1a2b3f0c1a2b' },
    items: [
      {
        description: 'Leche cruda',
        unit: 'LTR',
        quantity: '120',
        unit_price: '1800'
      }
    ]
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
