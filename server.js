const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
};

http.createServer((req, res) => {
  let filePath = path.join(ROOT, req.url.split('?')[0]);

  // Servir le fichier s'il existe
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback : toutes les routes → index.html
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  fs.createReadStream(path.join(ROOT, 'index.html')).pipe(res);

}).listen(PORT, () => {
  console.log(`Serveur SPA démarré sur http://localhost:${PORT}/`);
  console.log(`Page publique : http://localhost:${PORT}/book/f9a0-60a0-5274`);
  console.log(`Admin        : http://localhost:${PORT}/`);
  console.log(`Super-admin  : http://localhost:${PORT}/~admin`);
});
