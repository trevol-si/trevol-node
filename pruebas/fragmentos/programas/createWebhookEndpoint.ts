// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.webhookEndpoints.createWebhookEndpoint({
  webhookEndpointInput: {
    url: 'https://tu-servidor.co/webhooks/trevol',
    description: 'Producción: facturación',
    events: ['invoice.accepted', 'invoice.rejected', 'credit_note.accepted']
  }
});
console.log(resultado);
