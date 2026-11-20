// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.companySettings.updatePdfSettings({
  pdfSettingsUpdate: {
    letter_design_id: 'pdd_7d3e9a107d3e9a107d3e9a107d3e9a10',
    receipt_design_id: 'pdd_41b2c6f041b2c6f041b2c6f041b2c6f0'
  }
});
console.log(resultado);
