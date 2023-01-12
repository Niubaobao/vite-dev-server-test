const Koa = require("koa");
const app = new Koa();
const path = require("path");
const fs = require("fs");
const MagicString = require("magic-string");
const { init, parse: parseEsModule } = require("es-module-lexer");
const { buildSync } = require("esbuild");

const basePath = path.join("../vue/");

const typeAlias = {
  js: "application/javascript",
  css: "text/css",
  html: "text/html",
  json: "application/json",
};

app.use(async (ctx) => {
  console.log(ctx.url);
  if (/\.css\??[^.]*$/.test(ctx.url)) {
    // 拦截css请求
    let cssRes = fs.readFileSync(
      path.join(basePath, ctx.url.split("?")[0]),
      "utf-8"
    );
    if (checkQueryExist(ctx.url, "import")) {
      // import请求，返回js文件
      cssRes = `
            const insertStyle = (css) => {
                let el = document.createElement('style')
                el.setAttribute('type', 'text/css')
                el.innerHTML = css
                document.head.appendChild(el)
            }
            insertStyle(\`${cssRes}\`)
            export default insertStyle
        `;
      ctx.set("Content-Type", typeAlias.js);
    } else {
      // link请求，返回css文件
      ctx.set("Content-Type", typeAlias.css);
    }
    ctx.state = 200;
    ctx.body = cssRes;
  }

  if (/^\/@module\//.test(ctx.url)) {
    // 拦截/@module请求
    let pkg = removeQuery(ctx.url.slice(9));
    // 获取该模块的package.json
    let pkgJson = JSON.parse(
      fs.readFileSync(
        path.join(basePath, "node_modules", pkg, "package.json"),
        "utf8"
      )
    );
    // 找出该模块的入口文件
    let entry = pkgJson.module || pkgJson.main;
    // 使用esbuild编译
    let outfile = path.join(`./esbuild/${pkg}.js`);
    buildSync({
      entryPoints: [path.join(basePath, "node_modules", pkg, entry)],
      format: "esm",
      bundle: true,
      outfile,
    });
    let js = fs.readFileSync(outfile, "utf8");
    ctx.set("Content-Type", typeAlias.js);
    ctx.state = 200;
    ctx.body = js;
  }

  //js
  if (/\.js\??[^.]*$/.test(ctx.url)) {
    // js请求
    let js = fs.readFileSync(path.join(basePath, ctx.url), "utf-8");
    await init;
    let parseResult = parseEsModule(js);
    //[[导入][导出]] s e 导入的开始/结束位置 ss se代表整个导入语句的起止位置。

    // [
    //   [
    //     { n: 'vue', s: 27, e: 30, ss: 0, se: 31, d: -1, a: -1 },
    //     { n: './style.css', s: 40, e: 51, ss: 32, se: 52, d: -1, a: -1 },
    //     { n: './App.vue', s: 70, e: 79, ss: 53, se: 80, d: -1, a: -1 }
    //   ],
    //   [],
    //   false
    // ]

    let s = new MagicString(js);
    // 遍历导入语句
    parseResult[0].forEach((item) => {
      // 不是裸导入则替换
      if (item.n[0] !== "." && item.n[0] !== "/") {
        s.overwrite(item.s, item.e, `/@module/${item.n}`);
      } else {
        s.overwrite(item.s, item.e, `${item.n}?import`);
      }
    });
    ctx.set("Content-Type", typeAlias.js);
    ctx.state = 200;
    ctx.body = s.toString();
  }

  // html页面
  if (ctx.url === "/index.html") {
    let html = fs.readFileSync(path.join(basePath, "index.html"), "utf-8");
    ctx.set("Content-Type", typeAlias.html);
    ctx.response.status = 200;
    ctx.body = html;
  }
});

const removeQuery = (url) => {
  return url.split("?")[0];
};

// 判断url的某个query名是否存在
const checkQueryExist = (url, key) => {
  return url.indexOf(key) != -1;
};

app.listen(3001);
