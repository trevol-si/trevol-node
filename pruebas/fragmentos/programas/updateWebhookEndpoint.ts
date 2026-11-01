// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.webhookEndpoints.updateWebhookEndpoint({
  id: 'we_3f0c1a2b3f0c1a2b3f0c1a2b3f0c1a2b',
  webhookEndpointUpdate: {
    description: 'Pausado mientras migramos el servidor',
    status: 'paused'
  }
});
console.log(resultado);
