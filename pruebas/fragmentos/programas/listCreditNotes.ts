// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

for await (const item of trevol.paginate((cursor) => trevol.creditNotes.listCreditNotes({ limit: 100, startingAfter: cursor }))) {
  console.log(item.id);
}
