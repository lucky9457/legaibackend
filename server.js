/*crt one*/

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
const multer = require("multer");

const path = require("path");
const { format } = require("date-fns");
const fs = require('fs').promises;
const fsSync = require('fs'); 
app.use(express.json());
app.use(cors());
app.use("/files", express.static("files"));
const clientRoutes = require("./Routes/clientRoutes");


const axios = require('axios');
const math = require('mathjs');

const pdfParse = require('pdf-parse');
const mysql = require('mysql2/promise');
require('dotenv').config();


const PORT = process.env.PORT || 5000;

const mongoUrl = process.env.MANGO_DB_CONNECT_STRING

mongoose.connect(mongoUrl, {
  useNewUrlParser: true,
}).then(() => {
  console.log("Connected to database");
}).catch((e) => console.log(e));

// Multer configuration to accept all file types
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./files");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage: storage });

require("./pdfDetails");
const PdfSchema = mongoose.model("PdfDetails");

const storagesingle = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const uploadsingle = multer({ storage: storagesingle });

// OpenAI API key and endpoint
const OPENAI_API_KEY = process.env.REACT_APP_OPENAI_API_KEY
const OPENAI_API_URL = 'https://api.openai.com/v1/embeddings';

// Establish connection to SingleStore
let connection;

const establishConnection = async () => {
    try {
        connection = await mysql.createConnection({
            host: process.env.SINGLE_STORE_HOST,
            port: 3306,
            user: process.env.SINGLE_STORE_USER,
            password: process.env.SINGLE_STORE_PASSWORD,
            database: process.env.SINGLE_STORE_DATABASE
        });

        // Create the table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS myvectortable (
                id INT AUTO_INCREMENT PRIMARY KEY,
                text TEXT NOT NULL,
                vector BLOB NOT NULL
            )
        `);

        console.log('Database connection established successfully.');
    } catch (error) {
        console.error(`Error establishing database connection: ${error}`);
    }
};

establishConnection();

const extractTextFromPdf = async (pdfPath) => {
    try {
        const pdfData = await fs.readFile(pdfPath);
        const pdfText = await pdfParse(pdfData);
        return pdfText.text;
    } catch (error) {
        console.error(`Error extracting text from PDF: ${error}`);
        throw error;
    }
};

// Function to store PDF embeddings in the database
const storePdfEmbedding = async (pdfPath) => {
    try {
        const pdfText = await extractTextFromPdf(pdfPath);
        console.log('Extracted text from PDF:', pdfText);  // Debugging statement
        if (!pdfText.trim()) {
            console.error('Extracted text is empty or contains only whitespace.');
            throw new Error('Extracted text is empty or contains only whitespace.');
        }

        await connection.execute(`
            CREATE TABLE IF NOT EXISTS myvectortable (
                id INT AUTO_INCREMENT PRIMARY KEY,
                text TEXT NOT NULL,
                vector BLOB NOT NULL
            )
        `);

        const embedding = await generateEmbedding(pdfText);
        const embeddingJson = JSON.stringify(embedding);

        // Store the text and embedding in the database
        const query = 'INSERT INTO myvectortable (text, vector) VALUES (?, ?)';
        await connection.execute(query, [pdfText, embeddingJson]);

        console.log('PDF embedding stored in the database.');
    } catch (error) {
        console.error(`Error storing PDF embedding: ${error}`);
        throw error;
    }
};

// Function to generate embeddings for text using OpenAI API
const generateEmbedding = async (text) => {
    try {
        const response = await axios.post(OPENAI_API_URL, {
            input: text,
            model: "text-embedding-ada-002"
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });
        return response.data.data[0].embedding;
    } catch (error) {
        console.error(`Error generating embedding: ${error}`);
        throw error;
    }
};

// Function to calculate cosine similarity between two embeddings
const calculateSimilarity = (embedding1, embedding2) => {
    const dotProduct = math.dot(embedding1, embedding2);
    const norm1 = math.norm(embedding1);
    const norm2 = math.norm(embedding2);
    return dotProduct / (norm1 * norm2);
};

// Function to get chat completion from OpenAI
const getChatCompletion = async (mostSimilarText, userQuestion) => {
    const payload = {
        model: "gpt-4",
        messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: `Answer the question based on the following context:\n\n${mostSimilarText}\n\nQuestion: ${userQuestion}` }
        ],
        max_tokens: 200
    };

    try {
        const response = await axios.post('https://api.openai.com/v1/chat/completions', payload, {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data.choices[0].message.content;
    } catch (error) {
        console.error('Error completing chat:', error);
        throw error;
    }
};

// Endpoint to handle PDF upload and store embedding
app.post('/upload', uploadsingle.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).send('No file uploaded');
        }

        const filePath = file.path;
        
        await storePdfEmbedding(filePath);

        res.send('PDF uploaded and embedded successfully!');
    } catch (error) {
        console.error(`Error uploading and processing PDF: ${error}`);
        res.status(500).send('Internal server error');
    }
});



// Endpoint to handle PDF embedding
app.post('/embed-file', uploadsingle.single('file'), async (req, res) => {
    try {
        console.log('Request body:', req.body);
        console.log('Request file:', req.file);
        const {file} = req.body
        
        console.log('File received:', file); // Log the received file
        if (!file) {
            return res.status(400).send('No file uploaded');
        }

        const filePath = path.join(__dirname, "files", file);
        console.log(filePath)
        const pdfDocument = await PdfSchema.findOne({ pdf: file });
        console.log(pdfDocument)
        await PdfSchema.updateOne(
            { _id: pdfDocument._id },
            {
              $set: { status: "True" }, 
            }
          );
        
        const pdfDocuments = await PdfSchema.findOne({ pdf: file });
        console.log(pdfDocuments)

        await storePdfEmbedding(filePath);

        res.send('PDF embedding stored successfully!');
    } catch (error) {
        console.error(`Error embedding PDF: ${error}`);
        res.status(500).send('Internal server error');
    }
});



// Endpoint to handle question asking
app.post('/ask', async (req, res) => {
    try {
        const { question } = req.body;
        if (!question) {
            return res.status(400).json({ error: 'No question provided' });
        }

        const questionEmbedding = await generateEmbedding(question);

        // Retrieve all embeddings and text from the database
        const [rows] = await connection.execute('SELECT text, vector FROM myvectortable');
        let textChunks = [];
        let textEmbeddings = [];
        for (let row of rows) {
            const text = row.text;
            if (!text.trim()) {
                console.error('Stored text is empty or contains only whitespace.');
                continue;
            }

            textChunks.push(text);
            try {
                const floatList = JSON.parse(row.vector);
                textEmbeddings.push(floatList);
            } catch (error) {
                console.error(`Error parsing vector data: ${error}`);
            }
        }

        if (textEmbeddings.length === 0) {
            return res.status(500).json({ error: 'No valid text or embeddings found in the database' });
        }

        // Find the most similar text chunk
        let similarities = textEmbeddings.map((emb) =>
            calculateSimilarity(questionEmbedding, emb)
        );

        let mostSimilarIndex = similarities.indexOf(Math.max(...similarities));
        let mostSimilarText = textChunks[mostSimilarIndex];
        console.log('Most similar text:', mostSimilarText);  // Debugging statement

        if (!mostSimilarText.trim()) {
            console.error('Most similar text is empty or contains only whitespace.');
            return res.status(500).json({ error: 'Most similar text is empty or contains only whitespace' });
        }

        const answer = await getChatCompletion(mostSimilarText, question);

        res.json({ mostSimilarText, answer });

    } catch (error) {
        console.error(`Error in ask_question: ${error}`);
        res.status(500).send('Internal server error');
    }
});


app.post("/upload-files", upload.single("file"), async (req, res) => {
    console.log(req.file);
    const title = req.body.title;
    const fileName = req.file.filename;
    const filetype = req.file.mimetype;
    const filesize = req.file.size;
    const uploadDate = new Date();
    const formattedDate = format(uploadDate, "dd-MM-yyyy hh:mm a");
    const category  = req.body.category
  
    try {
      await PdfSchema.create({ title: title, pdf: fileName, filetype: filetype, uploadDate: formattedDate , filesize: filesize , Category: category,status:'false' });
      res.send({ status: "ok" });
    } catch (error) {
      res.json({ status: error });
    }
  });
  
  app.get("/get-files", async (req, res) => {
    const searchTerm = req.query.term;
    
    try {
      let data;
      if (searchTerm) {
        data = await PdfSchema.find({ title: { $regex: searchTerm, $options: 'i' } });
      } else {
        data = await PdfSchema.find({});
      }
      res.send({ status: "ok", data });
    } catch (error) {
      res.json({ status: error });
    }
  });
  
  
  
  app.delete("/delete-file/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const fileData = await PdfSchema.findById(id);
      if (!fileData) {
        return res.status(404).json({ status: "error", message: "File not found" });
      }
  
      const filePath = path.join(__dirname, "files", fileData.pdf);
  
      // Check if file exists in the filesystem
      if (!fsSync.existsSync(filePath)) {
        // Delete file record from MongoDB if the file doesn't exist in the filesystem
        await PdfSchema.findByIdAndDelete(id);
        return res.json({ status: "ok", message: "File record deleted from database. File not found in filesystem." });
      }
  
      // Delete file from filesystem
      fs.unlink(filePath, async (err) => {
        if (err) {
          console.error("Failed to delete file from filesystem:", err);
          return res.status(500).json({ status: "error", message: "Failed to delete file from filesystem" });
        }
  
        // Delete file record from MongoDB
        try {
          await PdfSchema.findByIdAndDelete(id);
          res.json({ status: "ok", message: "File deleted successfully" });
        } catch (error) {
          console.error("Failed to delete file record from database:", error);
          res.status(500).json({ status: "error", message: "Failed to delete file record from database" });
        }
      });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ status: "error", message: "Failed to delete file" });
    }
  });
  
  
  app.get("/files/:id", async (req, res) => {
    const { id } = req.params;
    try {
      const fileData = await PdfSchema.findById(id);
      if (!fileData) {
        return res.status(404).json({ status: "error", message: "File not found" });
      }
      const filePath = path.join(__dirname, "files", fileData.pdf);
      res.sendFile(filePath);
    } catch (error) {
      console.error("Error fetching file:", error);
      res.status(500).json({ status: "error", message: "Failed to fetch file" });
    }
  });
  
  
  app.get('/search-files', async (req, res) => {
    const searchTerm = req.query.term;
    try {
      const files = await File.find({ title: { $regex: searchTerm, $options: 'i' } });
      res.status(200).json({ status: 'ok', data: files });
    } catch (error) {
      console.error('Error searching files:', error);
      res.status(500).json({ status: 'error', message: 'Failed to search files' });
    }
  });
  
  
  app.get("/", async (req, res) => {
    res.send("Success!!!!!!");
  });


  app.use(clientRoutes);

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
