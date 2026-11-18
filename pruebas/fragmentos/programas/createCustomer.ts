// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.customers.createCustomer({
  catalogCustomerInput: {
    external_id: 'ERP-CLI-0042',
    document_type: '31',
    document_number: '900373427',
    name: 'DISTRIBUIDORA LOS ANDES SAS',
    person_type: 'legal',
    tax_responsibilities: ['O-13'],
    email: 'facturacion@distribuidoralosandes.example',
    phone: '6045550142',
    address: 'Carrera 43A # 1-50, Oficina 302',
    city: 'Medellín',
    municipality_code: '05001',
    defaults: {
      payment_form: 'credit',
      term_days: 30,
      payment_method: '47',
      withholding_agent: true
    }
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
