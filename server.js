const http=require("http"),fs=require("fs"),path=require("path");
const r="D:\\立方体 - 副本\\mota-js",p=4202;
const M={"Content-Type":"text/plain;charset=utf-8"};
http.createServer((q,s)=>{
  let u=q.url.split("?")[0];if(u==="/")u="/cube-map-viewer.html";
  let f=path.join(r,u.replace(/\.\./g,""));
  fs.readFile(f,(e,d)=>{
    if(e){s.writeHead(404,M);s.end("404")}
    else{
      let t={"html":"text/html;charset=utf-8","js":"text/javascript;charset=utf-8","css":"text/css","json":"application/json","png":"image/png","jpg":"image/jpeg","gif":"image/gif","svg":"image/svg+xml","ico":"image/x-icon","woff2":"font/woff2"};
      let e=path.extname(f).slice(1);
      s.writeHead(200,{"Content-Type":t[e]||"application/octet-stream","Access-Control-Allow-Origin":"*"});
      s.end(d)
    }
  })
}).listen(p,"127.0.0.1",()=>{console.log("Server on "+p)});
