# CAP-LEVEL X1 — 静态站点部署说明

这是一个**纯前端静态站点**，不需要 Node 后端、不需要构建、不需要数据库，也没有环境变量。部署后直接通过网址访问。

站点文件：

```text
index.html
styles.css
app.js
vendor/
.nojekyll
netlify.toml
```

> `index.html` 必须位于部署根目录；不要只上传 `index.html`，必须连同 `app.js`、`styles.css` 和 `vendor/` 一起上传。

---

## 方案一：Netlify Drop（最快，约 1 分钟）

1. 打开 <https://app.netlify.com/drop>
2. 把 `capacitive-level-gauge-site.zip`（或解压后的整个 `capacitive-level-gauge-site` 文件夹）拖进页面
3. 等待部署完成，Netlify 会给出一个 `https://xxxx.netlify.app` 地址
4. 手机、教室电脑、其他电脑都可以直接打开

不需要填写 Build command，Publish directory 保持根目录即可。

---

## 方案二：GitHub Pages

1. 新建一个 GitHub 仓库。
2. 将本目录中的**全部内容**上传到仓库根目录：
   - `index.html`
   - `styles.css`
   - `app.js`
   - `vendor/`
   - `.nojekyll`
   - `netlify.toml`
3. 打开仓库的 `Settings → Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`，分支选 `main`，目录选 `/ (root)`，保存。
5. 等待 1–2 分钟，访问：

```text
https://<你的用户名>.github.io/<仓库名>/
```

本项目所有资源都使用相对路径，因此部署在仓库子路径（如 `/cap-level/`）下也能正常加载；已在 `/cap-site/` 子路径下实测通过。

`.nojekyll` 用于阻止 GitHub Pages 的 Jekyll 处理静态资源。

---

## 方案三：Vercel

在站点目录执行：

```bash
npm i -g vercel
vercel
```

按提示操作即可。Framework Preset 选择 `Other`，Build Command 留空，Output Directory 保持 `.`（根目录）。也可以把仓库导入 Vercel 后直接部署。

---

## 注意事项

- 页面使用 Three.js WebGL，建议使用较新的 Chrome / Edge / Firefox / Safari。
- `vendor/` 中已包含 Three.js 和 OrbitControls，无需联网加载 CDN。
- 页面中的 3D 快照按钮会通过浏览器下载 PNG，不需要服务器权限。
- 如需修改内容，重新上传 `index.html`、`styles.css`、`app.js` 或 `vendor/` 即可。
- 不要直接双击 `index.html` 用 `file://` 打开；ES Module 和 import map 需要通过 HTTP(S) 访问。
