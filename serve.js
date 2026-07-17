const http = require('http');
const fs = require('fs');
const path = require('path');
const port = 8083;
const root = 'D:\\立方体 - 副本\\mota-js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
};

http.createServer((req, res) => {
  let filePath = path.join(root, req.url.split('?')[0]);
  const ext = path.extname(filePath);
  const ct = MIME[ext] || 'application/octet-stream';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' });
      res.end(data);
    }
  });
}).listen(port, () => {
  console.log('Server running at http://127.0.0.1:' + port);
});
