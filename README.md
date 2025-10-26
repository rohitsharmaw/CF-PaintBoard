本项目由于作者的 Cloudflare 账号无法承受过高负载而停止更新。

# CF-PaintBoard
提示：本项目由 GitHub Copilot Agent 编写！

## 部署方法
1. fork 本仓库
2. 在 `/public/app.js` 中找到 `API_BASE`，修改为你的域名
3. 修改 `/wrangler.toml`
4. 在 Cloudflare 连接到你 fork 的仓库
5. 构建命令为 `npm install`
6. 开始使用

请注意：每次像素点的绘画和邀请码、token操作都会对 KV 进行读取操作。请检查你的 KV 计划是否能够应对接下来的负载！
## 管理后台
初始的用户名为 `PaintBoard`，密码为 `PB123`  
密码基于 SHA-512 编码，输入时进行比对。  
如果你需要修改初始值，请在 `/src/index.js` 中的 `getConfigFromKV` 函数修改初始配置

管理后台基于 Web Basic Authentication，密码可能会在浏览器被缓存

在管理后台中可以修改冷却时间（精确到秒）和生成、撤销邀请码（可以设置最大使用次数和重置周期，可以显示当前周期内还能使用的次数）  
但是画布的大小需要修改配置文件。
## 主页绘画
顶端有两种选项可供用户选择：使用邀请码生成新的 token 或使用现有的 token

如果使用邀请码生成新的 token，生成成功后会显示接下来的时间内可以重新生成的次数，并提醒复制

如果使用现有 token 则会识别是否有效，然后使用这个 token 进行绘画

支持选择 HEX 颜色格式在画布上画一个像素点
