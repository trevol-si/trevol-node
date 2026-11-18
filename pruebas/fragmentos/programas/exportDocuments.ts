// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const archivo = await trevol.reports.exportDocuments({
  format: 'csv',
  issuedFrom: '2026-09-01',
  issuedTo: '2026-10-31'
});
// archivo es un Blob con el CSV
