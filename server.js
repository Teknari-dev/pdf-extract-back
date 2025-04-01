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
  baseURL: 'https://api.deepseek.com/v1',
});

// Almacenamiento en memoria para los datos (en producción usarías una base de datos)
const pdfData = {};

// Función modificada para extraer palabras clave usando DeepSeek
async function extractKeywords(text) {
  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          "role": "system", 
          "content": "Extrae exactamente 15 palabras clave más importantes del texto proporcionado. Cada palabra clave debe ser una sola palabra. No uses guiones, comas ni caracteres adicionales para unir palabras clave. No repitas palabras clave dentro del mismo conjunto de 15. Asegúrate de que todas las palabras clave sean relevantes y tengan significado en el contexto del texto. Formatea las palabras clave poniendo cada una entre asteriscos, por ejemplo: *migración*, *derechos humanos*, *discriminación*."
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
      
      // Mostrar información de consumo de tokens
      console.log('Consumo de tokens para el análisis:');
      console.log('Tokens de entrada:', completion.usage.prompt_tokens);
      console.log('Tokens de salida:', completion.usage.completion_tokens);
      console.log('Total de tokens:', completion.usage.total_tokens);
      console.log('----------------------------------------');
      
      return {
        fullResponse: response,
        keywords: extractedKeywords,
        tokenUsage: {
          prompt: completion.usage.prompt_tokens,
          completion: completion.usage.completion_tokens,
          total: completion.usage.total_tokens
        }
      };
    }
    
    return {
      fullResponse: response,
      keywords: [],
      tokenUsage: {
        prompt: completion.usage.prompt_tokens,
        completion: completion.usage.completion_tokens,
        total: completion.usage.total_tokens
      }
    };
  } catch (error) {
    console.error('Error al extraer palabras clave:', error);
    return {
      fullResponse: 'Error al analizar el texto',
      keywords: [],
      tokenUsage: {
        prompt: 0,
        completion: 0,
        total: 0
      }
    };
  }
}

// Función para validar si un número es parte de la secuencia de párrafos
function isValidParagraphNumber(number, previousNumber) {
  return number === previousNumber + 1;
}

// Función para obtener todos los números de párrafos del texto
function getAllParagraphNumbers(text) {
  const paragraphs = text.split('\n');
  const paragraphNumbers = [];
  let currentValidNumber = 0;
  
  paragraphs.forEach((line) => {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(/^(\d+)\.\s/);
    
    if (match) {
      const number = parseInt(match[1]);
      if (isValidParagraphNumber(number, currentValidNumber)) {
        paragraphNumbers.push(number);
        currentValidNumber = number;
      }
    }
  });
  
  return paragraphNumbers;
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

// Función para crear el índice de palabras clave
function createKeywordIndex(paragraphs) {
  const keywordIndex = {};
  
  paragraphs.forEach(paragraph => {
    paragraph.keywords.forEach(keyword => {
      if (!keywordIndex[keyword]) {
        keywordIndex[keyword] = {
          keyword: keyword,
          paragraphs: []
        };
      }
      keywordIndex[keyword].paragraphs.push({
        number: paragraph.number,
        text: paragraph.text.substring(0, 100) + '...' // Añadimos una vista previa del párrafo
      });
    });
  });

  return Object.values(keywordIndex);
}

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

  try {
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

    // Usa el texto editado para extraer los párrafos
    const editedText = pdfData[pdfId].editedText;
    const extractedParagraphs = extractParagraphsFromText(editedText, paragraphNumbersArray);
    
    // Analizar cada párrafo con IA y obtener tanto el análisis completo como las palabras clave
    const paragraphsWithAnalysis = [];
    let totalTokens = 0;
    
    for (const paragraph of extractedParagraphs) {
      const analysis = await extractKeywords(paragraph.text);
      totalTokens += analysis.tokenUsage.total;
      paragraphsWithAnalysis.push({
        ...paragraph,
        aiAnalysis: analysis.fullResponse,
        keywords: analysis.keywords
      });
    }

    // Mostrar resumen de consumo de tokens
    console.log('Resumen de consumo de tokens:');
    console.log('Total de párrafos analizados:', paragraphsWithAnalysis.length);
    console.log('Total de tokens consumidos:', totalTokens);
    console.log('Promedio de tokens por párrafo:', Math.round(totalTokens / paragraphsWithAnalysis.length));
    console.log('========================================');

    // Crear el índice de palabras clave
    const keywordIndex = createKeywordIndex(paragraphsWithAnalysis);
    
    res.json({ 
      extractedParagraphs: paragraphsWithAnalysis,
      keywordIndex: keywordIndex,
      tokenUsage: {
        total: totalTokens,
        averagePerParagraph: Math.round(totalTokens / paragraphsWithAnalysis.length)
      }
    });
  } catch (error) {
    console.error('Error extracting paragraphs:', error);
    res.status(500).send('Error extracting paragraphs');
  }
});

// Ruta para extraer todos los párrafos
app.post('/extract-all-paragraphs', async (req, res) => {
  const { pdfId } = req.body;
  
  if (!pdfId) {
    return res.status(400).send('Missing required fields');
  }

  if (!pdfData[pdfId]) {
    return res.status(404).send('PDF not found');
  }

  try {
    const editedText = pdfData[pdfId].editedText;
    const allParagraphNumbers = getAllParagraphNumbers(editedText);
    const extractedParagraphs = extractParagraphsFromText(editedText, allParagraphNumbers);
    
    const paragraphsWithAnalysis = [];
    let totalTokens = 0;
    
    for (const paragraph of extractedParagraphs) {
      const analysis = await extractKeywords(paragraph.text);
      totalTokens += analysis.tokenUsage.total;
      paragraphsWithAnalysis.push({
        ...paragraph,
        aiAnalysis: analysis.fullResponse,
        keywords: analysis.keywords
      });
    }

    // Mostrar resumen de consumo de tokens
    console.log('Resumen de consumo de tokens:');
    console.log('Total de párrafos analizados:', paragraphsWithAnalysis.length);
    console.log('Total de tokens consumidos:', totalTokens);
    console.log('Promedio de tokens por párrafo:', Math.round(totalTokens / paragraphsWithAnalysis.length));
    console.log('========================================');

    // Crear el índice de palabras clave
    const keywordIndex = createKeywordIndex(paragraphsWithAnalysis);
    
    res.json({ 
      extractedParagraphs: paragraphsWithAnalysis,
      keywordIndex: keywordIndex,
      tokenUsage: {
        total: totalTokens,
        averagePerParagraph: Math.round(totalTokens / paragraphsWithAnalysis.length)
      }
    });
  } catch (error) {
    console.error('Error extracting paragraphs:', error);
    res.status(500).send('Error extracting paragraphs');
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});