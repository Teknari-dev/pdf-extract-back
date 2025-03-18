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

// Nueva función para extraer de texto
function extractParagraphsFromText(text, paragraphNumbers) {
  const paragraphs = text.split('\n'); // No filtramos líneas vacías todavía

  const extractedParagraphs = paragraphNumbers.map(num => {
    // Expresión regular estricta para identificar números de párrafo
    const regex = new RegExp(`^${num}\\.\\s`);
    const startIndex = paragraphs.findIndex(p => regex.test(p.trim()));
    if (startIndex === -1) return null;

    let paragraph = paragraphs[startIndex].trim();
    for (let i = startIndex + 1; i < paragraphs.length; i++) {
      const currentLine = paragraphs[i].trim();

      // Detener si encontramos un nuevo número de párrafo, una línea vacía o "__________________"
      if (/^\d+\.\s/.test(currentLine) || currentLine === '' || currentLine.includes('__________________')) {
        break;
      }

      // Agregar la línea al párrafo si no está vacía
      if (currentLine !== '') {
        paragraph += ' ' + currentLine;
      }
    }

    // Formatear números de citas como superíndices (solo los que tienen un punto después)
    paragraph = paragraph.replace(/(\d+)\s\./g, '$1.'); // Eliminar espacios entre número y punto
    paragraph = paragraph.replace(/(\d+)\./g, (match, p1, offset) => {
      // Si es el primer número con punto (número de párrafo), dejarlo normal
      if (offset === 0) return match;
      // Si no, convertirlo en superíndice
      return `<sup>${p1}</sup>.`;
    });

    return {
      number: num,
      text: paragraph
    };
  }).filter(p => p);

  return extractedParagraphs;
}

module.exports = { 
  extractParagraphsFromPDF,
  extractParagraphsFromText
};