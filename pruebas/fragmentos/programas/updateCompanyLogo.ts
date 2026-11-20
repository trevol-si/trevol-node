// Generado por sdks/herramientas/fragmentos.mjs: el fragmento de la documentación, apuntando a Prism. No editar.
import { Trevol } from '../../../src/index.js';

const trevol = new Trevol(undefined, { baseUrl: process.env.TREVOL_PRISM_URL, maxRetries: 0 }); // lee TREVOL_API_KEY

const resultado = await trevol.companySettings.updateCompanyLogo({
  companyLogoInput: {
    image_base64: 'iVBORw0KGgoAAAANSUhEUgAAAGAAAAAgAQMAAADXDu8XAAAABlBMVEX///8KZKiBydPRAAAAJ0lEQVR42mNgIAPw////AcZmQpagAcf+/////////0BDe+jlH3IAAC07DVBS46jVAAAAAElFTkSuQmCC'
  }
});
console.log(resultado);
