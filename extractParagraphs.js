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
  return /^[a-z]/.test(line) || 
         /^otra/.test(line) || 
         /^[a-z]\)/.test(line) ||
         /^[A-Z][a-z]+ (de|en|con|y|o|u|las|los|del)/.test(line); // Palabras de conexión comunes
}

// Nueva función para extraer de texto
function extractParagraphsFromText(text, paragraphNumbers) {
  // Primero limpiamos el texto completo de elementos no deseados
  const cleanedText = text
    .split('\n')
    .filter(line => {
      const trimmedLine = line.trim();
      // Eliminar líneas que:
      return !(
        trimmedLine.includes('__________________') || // Líneas separadoras
        /^-\d+-$/.test(trimmedLine) || // Números de página (ej: -4-)
        /^\(\w+\)$/.test(trimmedLine) || // Marcadores de formato (ej: (S))
        /^\d{2}-\d{5}/.test(trimmedLine) // Códigos de documento
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
      let lastLineWasFootnote = false;

      for (let i = startIndex + 1; i < paragraphs.length && !nextParagraphFound; i++) {
        const currentLine = paragraphs[i].trim();
        
        if (currentLine === '') continue;

        // Detectar si es una nota al pie
        const isFootnote = /^\d+\s+[A-Z][a-z]/.test(currentLine) && 
                          !currentLine.includes('migratorias') &&
                          !currentLine.includes('trabajadoras');
        
        if (isFootnote) {
          lastLineWasFootnote = true;
          continue;
        }

        // Detener si encontramos el siguiente número válido de párrafo
        if (currentLine.match(/^\d+\.\s/) && validParagraphNumbers.has(parseInt(currentLine))) {
          nextParagraphFound = true;
          continue;
        }

        // Si la línea anterior era una nota al pie y esta línea no parece ser continuación,
        // consideramos que el párrafo ha terminado
        if (lastLineWasFootnote && !isLineContinuation(currentLine)) {
          nextParagraphFound = true;
          continue;
        }

        // Incluir la línea si:
        // - No es una línea separadora
        // - No es un código de documento
        // - No es una nota al pie
        if (!currentLine.includes('__________________') &&
            !/^\d{2}-\d{5}/.test(currentLine)) {
          
          // Si la línea comienza con un inciso o es continuación, añadimos un espacio
          if (/^[a-z]\)/.test(currentLine) || isLineContinuation(currentLine)) {
            const lastChar = paragraph.slice(-1);
            const needsSpace = lastChar !== ' ' && lastChar !== ';';
            paragraph += (needsSpace ? ' ' : '') + currentLine;
          } else {
            // Para otras líneas, verificamos si parece ser parte del mismo párrafo
            const lastChar = paragraph.slice(-1);
            const firstChar = currentLine.charAt(0);
            const needsSpace = lastChar !== ' ' && lastChar !== ';' && firstChar !== ',';
            paragraph += (needsSpace ? ' ' : '') + currentLine;
          }
        }

        lastLineWasFootnote = isFootnote;
      }

      // Limpiamos el texto del párrafo
      paragraph = cleanText(paragraph)
        .replace(/^\d+\.\s+/, '') // Removemos el número del párrafo al inicio
        .replace(/\s*\d+\s*(?=\n|$)/, '') // Removemos números sueltos al final (posibles notas al pie)
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