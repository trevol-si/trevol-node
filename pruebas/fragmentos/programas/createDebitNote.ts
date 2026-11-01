// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.debitNotes.createDebitNote({
  noteInput: {
    external_id: 'INT-2026-000012',
    concept: '1',
    description: 'Intereses de mora de la factura de septiembre',
    invoice: { id: 'inv_3f0c1a2b3f0c1a2b3f0c1a2b3f0c1a2b' },
    items: [
      {
        description: 'Intereses de mora',
        unit: '94',
        quantity: '1',
        unit_price: '45000'
      }
    ]
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
