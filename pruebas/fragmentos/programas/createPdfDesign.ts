// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.pdfDesigns.createPdfDesign({
  pdfDesignInput: {
    template: 'modern',
    name: 'Moderno verde',
    accent_color: '#118305',
    font: 'inter',
    logo: 'company',
    set_as_default: true
  },
  // idempotencyKey: 'VENTA-2026-000123', // opcional: si falta, el SDK pone una y la repite en los reintentos
});
console.log(resultado);
