// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.radianEvents.createRadianEvent({
  radianEventInput: {
    external_id: 'ERP-ACUSE-DA1234',
    event_code: '030',
    invoice: {
      cufe: 'cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd',
      number: 'DA1234',
      type: '01',
      issuer: {
        nit: '900373427',
        check_digit: 3,
        document_type: '31',
        name: 'DISTRIBUIDORA LOS ANDES SAS'
      }
    }
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
