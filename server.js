const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = __dirname; // serve files from this directory
const DB_PATH = path.join(__dirname, 'PasswordDatabase.txt');

function readDB(){
  try{
    const raw = fs.readFileSync(DB_PATH, 'utf8').trim();
    if(!raw) return [];
    return JSON.parse(raw);
  }catch(e){
    return [];
  }
}

function writeDB(data){
  // atomic write: write to temp file then rename
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, DB_PATH);
}

function sendJSON(res, obj, code=200){
  const body = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json','Content-Length': Buffer.byteLength(body)});
  res.end(body);
}

function serveStatic(req, res){
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if(reqPath === '/') reqPath = '/MainPage.html';
  const filePath = path.join(PUBLIC_DIR, reqPath.replace(/^\/+/, ''));

  fs.stat(filePath, (err, stats) =>{
    if(err || !stats.isFile()){
      res.writeHead(404, {'Content-Type':'text/plain'});
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const map = {'.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.txt':'text/plain', '.json':'application/json'};
    const contentType = map[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, {'Content-Type': contentType});
    stream.pipe(res);
  });
}

const server = http.createServer((req, res)=>{
  const url = req.url;
  if(url.startsWith('/api/passwords')){
    // API
    if(req.method === 'GET'){
      const data = readDB();
      // prevent aggressive caching in clients
      res.setHeader('Cache-Control', 'no-store');
      sendJSON(res, data);
      return;
    }

    if(req.method === 'POST'){
      let body='';
      req.on('data',(chunk)=> body += chunk);
      req.on('end', ()=>{
        try{
          const item = JSON.parse(body);
          if(!item || !item.website) return sendJSON(res,{error:'invalid'},400);
          const db = readDB();
          const id = Date.now().toString();
          const record = { id, website: item.website, username: item.username||'', password: item.password||'' };
          db.push(record);
          writeDB(db);
          sendJSON(res, record, 201);
        }catch(e){
          sendJSON(res,{error:'bad json'},400);
        }
      });
      return;
    }

    // PUT /api/passwords/:id
    if(req.method === 'PUT'){
      const parts = url.split('/');
      const id = parts[parts.length-1];
      let body='';
      req.on('data',(c)=> body+=c);
      req.on('end', ()=>{
        try{
          const item = JSON.parse(body);
          const db = readDB();
          const idx = db.findIndex(r=>r.id===id);
          if(idx === -1) return sendJSON(res,{error:'not found'},404);
          db[idx] = Object.assign({}, db[idx], item);
          writeDB(db);
          sendJSON(res, db[idx]);
        }catch(e){ sendJSON(res,{error:'bad json'},400); }
      });
      return;
    }

    // DELETE /api/passwords/:id
    if(req.method === 'DELETE'){
      const parts = url.split('/');
      const id = parts[parts.length-1];
      const db = readDB();
      const idx = db.findIndex(r=>r.id===id);
      if(idx === -1){ sendJSON(res,{error:'not found'},404); return; }
      const removed = db.splice(idx,1)[0];
      writeDB(db);
      sendJSON(res, removed);
      return;
    }

    res.writeHead(405, {'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'method not allowed'}));
    return;
  }

  // static
  serveStatic(req, res);
});

server.listen(PORT, ()=> console.log(`Server running at http://localhost:${PORT}/MainPage.html`));
