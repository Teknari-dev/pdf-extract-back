# PDF Paragraph Extractor Server

Este servidor backend proporciona una API para procesar archivos PDF, extraer párrafos específicos y analizarlos utilizando IA. El servidor utiliza la API de DeepSeek para realizar análisis de texto y extracción de palabras clave.

## Características

- Procesamiento de archivos PDF
- Extracción de párrafos específicos
- Análisis de texto mediante IA (DeepSeek)
- Extracción automática de palabras clave
- API RESTful con endpoints documentados

## Requisitos Previos

- Node.js (versión 14 o superior)
- npm (Node Package Manager)
- Una cuenta de NVIDIA con acceso a la API de DeepSeek

## Instalación

1. Clona el repositorio:
```bash
git clone [URL_DEL_REPOSITORIO]
cd [NOMBRE_DEL_DIRECTORIO]
```

2. Instala las dependencias:
```bash
npm install
```

3. Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:
```
NVIDIA_API_KEY=tu_api_key_aquí
PORT=5000
```

4. Inicia el servidor:
```bash
# Para desarrollo (con nodemon)
npm run dev

# Para producción
npm start
```

## Endpoints de la API

### 1. Procesar PDF
- **URL**: `/process-pdf`
- **Método**: POST
- **Descripción**: Procesa un archivo PDF y extrae su texto
- **Formato**: multipart/form-data
- **Parámetros**:
  - `pdf`: Archivo PDF a procesar
- **Respuesta**:
  ```json
  {
    "rawText": "texto extraído del PDF",
    "pdfId": "identificador único del PDF"
  }
  ```

### 2. Guardar Texto Editado
- **URL**: `/save-edited-text`
- **Método**: POST
- **Descripción**: Guarda el texto editado de un PDF específico
- **Parámetros**:
  - `pdfId`: ID del PDF
  - `editedText`: Texto editado a guardar
- **Respuesta**:
  ```json
  {
    "success": true,
    "message": "Text edited successfully"
  }
  ```

### 3. Extraer y Analizar Párrafos
- **URL**: `/extract-from-edited`
- **Método**: POST
- **Descripción**: Extrae párrafos específicos del texto editado y los analiza con IA
- **Parámetros**:
  - `pdfId`: ID del PDF
  - `paragraphNumbers`: Array de números de párrafos a extraer
- **Respuesta**:
  ```json
  {
    "extractedParagraphs": [
      {
        "number": "número del párrafo",
        "text": "texto del párrafo",
        "aiAnalysis": "análisis completo por IA",
        "keywords": ["palabra1", "palabra2", ...]
      }
    ]
  }
  ```

## Estructura del Proyecto

```
.
├── server.js              # Servidor principal
├── extractParagraphs.js   # Lógica de extracción de párrafos
├── package.json          # Dependencias y scripts
├── .env                  # Variables de entorno
└── node_modules/        # Módulos instalados
```

## Tecnologías Utilizadas

- Express.js
- PDF Parse
- OpenAI (para DeepSeek)
- Express File Upload
- CORS
- dotenv

## Notas

- El servidor almacena temporalmente los datos en memoria. En un entorno de producción, se recomienda implementar una base de datos.
- La API de DeepSeek requiere una clave de API válida de NVIDIA.
- El servidor está configurado para manejar archivos PDF de hasta 50MB.

## Licencia

ISC 