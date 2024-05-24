const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
var ws_clients = []
const runConfigurator = require('./configurator');

if (!fs.existsSync('config.json')) {
    runConfigurator();
  } else {
    startServer();
  }
function startServer(){
    const config = require('./config.json');
    const websocketHandlers = require('./websocketHandlers')
    const apiRoutes = require('./apiRoutes');
    var ws_clients = [];
  
    const app = express();
    const port = config.SERVER_PORT;
  
    const server = app.listen(port, () => {
      console.log(`Server is running on ${config.SERVER_HOSTNAME}:${port}`);
    });


const wss = new WebSocket.Server({ server: server });
websocketHandlers(wss);

// Middleware to prevent caching
const preventCache = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
};

// Set up storage engine for multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir);
        }
        cb(null, 'uploads');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = path.join(__dirname, 'uploads', req.file.filename);

  sharp(filePath)
      .resize({
          width: 1000,
          height: 1000,
          fit: sharp.fit.inside,
          withoutEnlargement: true
      })
      .toBuffer()
      .then(data => {
          fs.writeFile(filePath, data, err => {
              if (err) {
                  return res.status(500).json({ error: 'Error processing image' });
              }

              const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
              res.status(200).json({ fileUrl });
          });
      })
      .catch(err => {
          res.status(500).json({ error: 'Error resizing image' });
      });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
    res.redirect('/app');
});

app.use("/app", preventCache, express.static(path.join(__dirname, 'public')));

app.get('/app', preventCache, (req, res) => {
    return res.status(200).sendFile(`${__dirname}/public/${req.url}`);
});

app.get('/app/conv', preventCache, (req, res) => {
    res.redirect('/app');
});

app.get('/app/conv/*', (req, res) => {
    return res.status(200).sendFile(`${__dirname}/public/index.html`);
});

app.use('/api', apiRoutes);

module.exports = { ws_clients };
}