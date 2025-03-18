// server.js
const express = require('express');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { extractParagraphsFromText } = require('./extractParagraphs');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');
require("dotenv").config();

const app = express();
app.use(cors());
app.use(fileUpload());
app.use(express.json({ limit: '50mb' }));

// Configuración de la API de OpenAI para DeepSeek
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});

// Almacenamiento en memoria para los datos (en producción usarías una base de datos)
const pdfData = {};

// Función modificada para extraer palabras clave usando DeepSeek R1
async function extractKeywords(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-ai/deepseek-r1",
      messages: [
        {
          "role": "system", 
          "content": "Proporciona 15 palabras clave más importantes (solo una palabra clave). Piensa en detalle sobre el contenido y su significado. Asegúrate de poner SOLO las palabras clave entre asteriscos, por ejemplo: *palabra clave*. Las palabras clave deben estar separadas, cada una con sus propios asteriscos."
        },
        {
          "role": "user", 
          "content": text
        }
      ],
      temperature: 0.2,
      max_tokens: 1024
    });

    const response = completion.choices[0].message.content.trim();
    
    // Extraer solo las palabras clave entre asteriscos
    const keywordsArray = [];
    const matches = response.match(/\*(.*?)\*/g);
    
    if (matches) {
      const extractedKeywords = matches.map(match => match.replace(/\*/g, '').trim());
      return {
        fullResponse: response,
        keywords: extractedKeywords
      };
    }
    
    return {
      fullResponse: response,
      keywords: []
    };
  } catch (error) {
    console.error('Error al extraer palabras clave:', error);
    return {
      fullResponse: 'Error al analizar el texto',
      keywords: []
    };
  }
}

// Ruta para procesar el PDF y obtener su texto
app.post('/process-pdf', async (req, res) => {
  if (!req.files || !req.files.pdf) {
    return res.status(400).send('No PDF file uploaded.');
  }

  const { pdf } = req.files;

  try {
    // Guarda el archivo temporalmente
    const tempFilePath = path.join(__dirname, 'temp.pdf');
    await pdf.mv(tempFilePath);

    // Genera un ID único para el PDF
    const pdfId = pdf.name + '_' + Date.now();

    // Extrae el texto crudo usando pdf-parse
    const dataBuffer = fs.readFileSync(tempFilePath);
    const data = await pdfParse(dataBuffer);
    const rawText = data.text; // Texto crudo extraído

    // Almacena los datos del PDF
    pdfData[pdfId] = {
      originalText: rawText,
      editedText: rawText, // Inicialmente igual al texto original
      fileName: pdf.name
    };

    // Elimina el archivo temporal
    fs.unlinkSync(tempFilePath);

    // Devuelve el texto crudo y el ID del PDF
    res.json({ 
      rawText,
      pdfId
    });
  } catch (error) {
    console.error('Error processing PDF:', error);
    res.status(500).send('Error processing PDF.');
  }
});

// Ruta para guardar el texto editado
app.post('/save-edited-text', (req, res) => {
  const { pdfId, editedText } = req.body;
  
  if (!pdfId || editedText === undefined) {
    return res.status(400).send('Missing required fields');
  }

  // Verifica si existe este PDF
  if (!pdfData[pdfId]) {
    return res.status(404).send('PDF not found');
  }

  // Guarda el texto editado
  pdfData[pdfId].editedText = editedText;
  
  res.json({ success: true, message: 'Text edited successfully' });
});

// Ruta para extraer párrafos del texto editado con análisis completo
app.post('/extract-from-edited', async (req, res) => {
  const { pdfId, paragraphNumbers } = req.body;
  
  if (!pdfId || !paragraphNumbers) {
    return res.status(400).send('Missing required fields');
  }

  // Verifica si existe este PDF
  if (!pdfData[pdfId]) {
    return res.status(404).send('PDF not found');
  }

  // Parsea paragraphNumbers desde JSON
  let paragraphNumbersArray;
  try {
    paragraphNumbersArray = JSON.parse(paragraphNumbers);
    if (!Array.isArray(paragraphNumbersArray)) {
      return res.status(400).send('paragraphNumbers must be an array.');
    }
  } catch (error) {
    return res.status(400).send('Invalid paragraphNumbers format.');
  }

  try {
    // Usa el texto editado para extraer los párrafos
    const editedText = pdfData[pdfId].editedText;
    const extractedParagraphs = extractParagraphsFromText(editedText, paragraphNumbersArray);
    
    // Analizar cada párrafo con IA y obtener tanto el análisis completo como las palabras clave
    const paragraphsWithAnalysis = [];
    
    for (const paragraph of extractedParagraphs) {
      const analysis = await extractKeywords(paragraph.text);
      paragraphsWithAnalysis.push({
        ...paragraph,
        aiAnalysis: analysis.fullResponse,
        keywords: analysis.keywords
      });
    }
    
    res.json({ extractedParagraphs: paragraphsWithAnalysis });
  } catch (error) {
    console.error('Error extracting paragraphs:', error);
    res.status(500).send('Error extracting paragraphs');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});