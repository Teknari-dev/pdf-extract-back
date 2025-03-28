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

  // Identificamos todos los números de párrafo válidos (secuenciales)
  paragraphs.forEach((line) => {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^(\d+)\.\s/);
    
    if (match) {
      const number = parseInt(match[1]);
      if (isValidParagraphNumber(number, currentValidNumber)) {
        validParagraphNumbers.add(number);
        currentValidNumber = number;
      }
    }
  });

  // Extraemos solo los párrafos solicitados que sean válidos
  const extractedParagraphs = paragraphNumbers
    .filter(num => validParagraphNumbers.has(num))
    .map(num => {
      const regex = new RegExp(`^${num}\\.\\s`);
      const startIndex = paragraphs.findIndex(p => regex.test(p.trim()));
      if (startIndex === -1) return null;

      let paragraph = paragraphs[startIndex].trim();
      let nextParagraphFound = false;

      for (let i = startIndex + 1; i < paragraphs.length && !nextParagraphFound; i++) {
        const currentLine = paragraphs[i].trim();
        
        // Solo detenemos si encontramos el siguiente número válido de párrafo
        if (currentLine.match(/^\d+\.\s/) && validParagraphNumbers.has(parseInt(currentLine))) {
          nextParagraphFound = true;
          continue;
        }

        // Incluimos todas las líneas que no estén vacías
        if (currentLine !== '') {
          paragraph += ' ' + currentLine;
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