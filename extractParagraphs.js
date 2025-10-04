const fs = require('fs');
const pdfParse = require('pdf-parse');

// Función original para extraer de archivo PDF
async function extractParagraphsFromPDF(filePath, paragraphNumbers) {
  const dataBuffer = fs.readFileSync(filePath);

  try {
    const data = await pdfParse(dataBuffer);
    const text = data.text;
    return extractParagraphsFromText(text, paragraphNumbers);
  } catch (error) {
    console.error('Error reading PDF:', error);
    throw error; // Lanza el error para manejarlo en el backend
  }
}

// Función para validar si un número es parte de la secuencia de párrafos
function isValidParagraphNumber(number, previousNumber) {
  return number === previousNumber + 1;
}

// Función para limpiar el texto de elementos no deseados
function cleanText(text) {
  return text
    // Eliminar líneas que son solo números (números de página)
    .replace(/^\d+$/gm, '')
    // Eliminar códigos de documento (ej: 08-63561)
    .replace(/\d{2}-\d{5}/g, '')
    // Eliminar marcadores de formato (ej: (S))
    .replace(/\(\w\)/g, '')
    // Eliminar líneas que son solo guiones bajos
    .replace(/^_{2,}$/gm, '')
    // Eliminar notas al pie (número seguido de texto explicativo)
    .replace(/\d+\s+[A-Z][a-z].*?(?=\n|$)/g, '')
    // Eliminar citas comunes
    .replace(/^\d+\s+(Véase|Ver|Cf\.|Vid\.).*$/gm, '')
    .replace(/^\d+\s+(Declaración|Convención|Pacto|Tratado|Observación general|Recomendación general).*$/gm, '')
    .replace(/^\d+\s+(art\.|apartado|párrafo).*$/gm, '')
    // Normalizar espacios
    .replace(/\s+/g, ' ')
    .trim();
}

// Función para verificar si una línea parece ser continuación de un párrafo
function isLineContinuation(line) {
  // Una línea es continuación si:
  // - Comienza con minúscula
  // - O comienza con "otra" u "otras" (casos comunes en continuaciones)
  // - O es un inciso (a), b), c), etc.)
  // - O comienza con una palabra que parece ser continuación (y, o, u, pero, sin embargo, etc.)
  return /^[a-z]/.test(line) || 
         /^otra/.test(line) || 
         /^[a-z]\)/.test(line) ||
         /^[A-Z][a-z]+ (de|en|con|y|o|u|las|los|del|pero|sin|aunque|por|que|cuando|si|mientras|además|también|así|como|pues|porque|aunque|a pesar|no obstante|sin embargo)/.test(line);
}

// Función para detectar si una línea es una cita
function isCitation(line) {
  const trimmedLine = line.trim();
  
  // Patrones comunes de citas:
  // - Números seguidos de "Véase" o "Ver"
  // - Números seguidos de "Declaración", "Convención", "Pacto", etc.
  // - Números seguidos de "art.", "apartado", "párrafo"
  // - Números seguidos de "Observación general"
  // - Números seguidos de "Recomendación"
  // - Líneas que contienen "art.", "apartado", "párrafo", "p.", "pp."
  // - Líneas que contienen "Véase", "Ver", "Cf.", "Vid."
  // - Líneas que contienen "Declaración", "Convención", "Pacto", "Tratado"
  // - Líneas que contienen "Observación general", "Recomendación general"
  // - Líneas que contienen "Comité", "Comisión"
  // - Líneas que contienen "A/HRC", "E/", "CEDAW", "CCPR", etc. (códigos de documentos)
  
  return /^\d+\s+(Véase|Ver|Cf\.|Vid\.)/i.test(trimmedLine) ||
         /^\d+\s+(Declaración|Convención|Pacto|Tratado|Observación general|Recomendación general)/i.test(trimmedLine) ||
         /^\d+\s+(art\.|apartado|párrafo)/i.test(trimmedLine) ||
         /(art\.|apartado|párrafo|p\.|pp\.)/i.test(trimmedLine) ||
         /(Véase|Ver|Cf\.|Vid\.)/i.test(trimmedLine) ||
         // Solo detectar como citas si empiezan con estas palabras específicas
         /^(Declaración|Convención|Pacto|Tratado)/i.test(trimmedLine) ||
         /^(Observación general|Recomendación general)/i.test(trimmedLine) ||
         /^(Comité|Comisión)/i.test(trimmedLine) ||
         /(A\/HRC|E\/|CEDAW|CCPR|CESCR|CERD|CAT|CRC|CMW|CRPD|CED)/i.test(trimmedLine) ||
         // Líneas que son solo números (posibles referencias)
         /^\d+$/.test(trimmedLine) ||
         // Líneas que contienen códigos de documentos
         /\d{2}-\d{5}/.test(trimmedLine) ||
         // Líneas que contienen años entre paréntesis
         /\(\d{4}\)/.test(trimmedLine);
}

// Función para detectar si una línea es un título de sección
function isSectionTitle(line) {
  const trimmedLine = line.trim();
  
  // Patrones MUY específicos de títulos de sección:
  // Solo detectamos títulos que son OBVIAMENTE títulos de sección
  
  return /^[A-Z]\.\s[A-Z]/.test(trimmedLine) || // A. Título, B. Título, etc.
         /^[IVX]+\.\s[A-Z]/.test(trimmedLine) || // I. Título, II. Título, etc.
         /^(INTRODUCCIÓN|CONCLUSIONES|RECOMENDACIONES|ANEXOS?)$/i.test(trimmedLine) ||
         // Solo títulos muy específicos que empiezan con letra seguida de punto
         /^[A-Z]\.\s.*?(Limitaciones|Obligaciones|Recomendaciones|Conclusiones|Introducción)/i.test(trimmedLine) ||
         // Títulos que contienen "derecho a" y empiezan con letra seguida de punto
         /^[A-Z]\.\s.*derecho a/i.test(trimmedLine);
}

// Función para detectar si una línea es un título de subsección
function isSubsectionTitle(line) {
  const trimmedLine = line.trim();
  
  // Detecta títulos de subsección:
  // - a) Título, b) Título, c) Título, etc.
  // - 1) Título, 2) Título, etc.
  // - i) Título, ii) Título, etc.
  // - Incisos seguidos de una sola palabra que parece ser un título
  
  return /^[a-z]\)\s+[A-Z][a-z]+$/.test(trimmedLine) || // a) Título, b) Título, etc.
         /^\d+\)\s+[A-Z][a-z]+$/.test(trimmedLine) || // 1) Título, 2) Título, etc.
         /^[ivx]+\)\s+[A-Z][a-z]+$/.test(trimmedLine) || // i) Título, ii) Título, etc.
         // Incisos seguidos de palabras que parecen títulos (una sola palabra en mayúscula)
         /^[a-z]\)\s+[A-Z][a-z]+$/.test(trimmedLine) ||
         /^\d+\)\s+[A-Z][a-z]+$/.test(trimmedLine);
}

// Nueva función para extraer de texto
function extractParagraphsFromText(text, paragraphNumbers) {
  // Primero eliminamos los bloques de notas al pie
  const cleanedText = text
    .split('\n')
    .reduce((acc, line, index, array) => {
      const currentLine = line.trim();
      
      // Si encontramos una línea separadora, buscamos hasta donde termina el bloque de notas
      if (currentLine.includes('__________________')) {
        let skipUntil = index;
        
        // Buscamos el final del bloque (número de página o siguiente párrafo numerado)
        for (let i = index + 1; i < array.length; i++) {
          const nextLine = array[i].trim();
          if (nextLine.match(/^-\d+-$/) || // Número de página
              (nextLine.match(/^\d+\.\s/) && !nextLine.match(/^\d+\s+[A-Z]/))) { // Siguiente párrafo numerado
            skipUntil = i;
            break;
          }
        }
        
        // Marcamos todas las líneas del bloque para ser eliminadas
        for (let i = index; i <= skipUntil; i++) {
          array[i] = '';
        }
        return acc;
      }
      
      return acc + (currentLine && !currentLine.includes('_') ? '\n' + line : '');
    }, '')
    .split('\n')
    .filter(line => {
      const trimmedLine = line.trim();
      return !(
        /^-\d+-$/.test(trimmedLine) || // Números de página (ej: -4-)
        /^\d{2}-\d{5}/.test(trimmedLine) || // Códigos de documento
        /^\(\w+\)$/.test(trimmedLine) || // Marcadores de formato
        trimmedLine.includes('_') || // Líneas con guiones bajos
        trimmedLine === '' // Líneas vacías
      );
    })
    .join('\n');

  const paragraphs = cleanedText.split('\n');
  const validParagraphNumbers = new Set();
  let currentValidNumber = 0;

  // Identificamos todos los números de párrafo válidos (más flexible)
  console.log('Buscando párrafos numerados en el texto...');
  let paragraphCount = 0;
  paragraphs.forEach((line, index) => {
    const trimmedLine = line.trim();
    // Patrón más flexible: número + punto + (espacio opcional) + texto
    const match = trimmedLine.match(/^(\d+)\.\s?(.+)/);
    
    if (match) {
      const number = parseInt(match[1]);
      const text = match[2];
      // Aceptar cualquier párrafo numerado, no solo secuenciales
      validParagraphNumbers.add(number);
      paragraphCount++;
      console.log(`Párrafo encontrado: ${number} - "${text.substring(0, 50)}..."`);
    }
    
    // Debug: mostrar algunas líneas que podrían ser párrafos pero no coinciden
    if (index < 20 && trimmedLine.length > 0) {
      console.log(`Línea ${index}: "${trimmedLine}"`);
    }
  });
  
  console.log(`Total de párrafos numerados encontrados: ${paragraphCount}`);
  
  console.log('Números de párrafos válidos encontrados:', Array.from(validParagraphNumbers).sort((a, b) => a - b));
  console.log('Párrafos solicitados:', paragraphNumbers);

  // Extraemos solo los párrafos solicitados que sean válidos
  const extractedParagraphs = paragraphNumbers
    .filter(num => {
      const isValid = validParagraphNumbers.has(num);
      console.log(`Párrafo ${num} - Válido: ${isValid}`);
      return isValid;
    })
    .map(num => {
      console.log(`Intentando extraer párrafo ${num}...`);
      // Patrón flexible: número + punto + (espacio opcional)
      const regex = new RegExp(`^${num}\\.\\s?`);
      const startIndex = paragraphs.findIndex(p => regex.test(p.trim()));
      console.log(`Párrafo ${num} - Índice encontrado: ${startIndex}`);
      if (startIndex === -1) {
        console.log(`Párrafo ${num} - NO ENCONTRADO`);
        return null;
      }

      let paragraph = paragraphs[startIndex].trim();
      let nextParagraphFound = false;

       for (let i = startIndex + 1; i < paragraphs.length && !nextParagraphFound; i++) {
         const currentLine = paragraphs[i].trim();
         
         // Debug: mostrar cada línea que se está procesando
         //console.log(`Procesando línea ${i}: "${currentLine}"`);
         
         // Solo detenemos si encontramos el siguiente número válido de párrafo
         const nextParagraphMatch = currentLine.match(/^(\d+)\.\s?/);
         if (nextParagraphMatch && validParagraphNumbers.has(parseInt(nextParagraphMatch[1]))) {
           //console.log('Detectado siguiente párrafo numerado:', currentLine);
           nextParagraphFound = true;
           continue;
         }

         // Si la línea es una cita, la excluimos del párrafo
         if (isCitation(currentLine)) {
           //console.log('Detectado como cita:', currentLine);
           continue;
         }

         // Si la línea es un título de sección, paramos aquí
         if (isSectionTitle(currentLine)) {
           // Debug: mostrar qué línea se detectó como título
           //console.log('Detectado como título de sección:', currentLine);
           nextParagraphFound = true;
           continue;
         }

         // Si la línea es un título de subsección, paramos aquí
         if (isSubsectionTitle(currentLine)) {
           // Debug: mostrar qué línea se detectó como título de subsección
           //console.log('Detectado como título de subsección:', currentLine);
           nextParagraphFound = true;
           continue;
         }

         // Incluimos todas las líneas que no estén vacías y no sean citas ni títulos
         if (currentLine !== '') {
           paragraph += ' ' + currentLine;
           //console.log('Agregando al párrafo:', currentLine);
         }
       }

      // Limpiamos el texto del párrafo
      paragraph = paragraph
        .replace(/^\d+\.\s+/, '') // Removemos el número del párrafo al inicio
        .replace(/\s+/g, ' ') // Normalizamos espacios
        .trim();

      return {
        number: num,
        text: paragraph
      };
    })
    .filter(p => p);

  return extractedParagraphs;
}

module.exports = { 
  extractParagraphsFromPDF,
  extractParagraphsFromText
};