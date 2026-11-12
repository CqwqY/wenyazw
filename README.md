# 文芽作文

新概念作文平台。核心是 **AI 写作工作台**：填题目、配自己的接口，作文按固定写作铁律逐字写进稿纸。

## 状态

可上线版本（纯静态，零构建，GitHub Pages 部署于 `wenyazw.top`）。

## 核心功能

`index.html` 即工作台，无后端、无数据上传：

| 模块 | 说明 |
| --- | --- |
| 输入 | 题目／题材、学段、篇幅、额外要求；三个示例题目 |
| 接口配置 | OpenAI 兼容格式：服务商预设、Base URL、API Key、模型名、接口路径、温度、max_tokens |
| 稿纸 | SSE 流式逐字渲染，方格稿纸排版；支持停止、清空、复制、下载 txt |
| 生成规则 | 12 条写作铁律写在 `assets/js/prompt.js`，页面上可展开查看，不可关闭 |

生成规则要点：忌空泛、重引用寄托、以人物之言承载主旨、白描为主、内核要实、冲突要具体、人物要立体、双线结构、金句与过渡、避开危险素材、普通话、关键段落动作白描。

**接口注意事项**

- API Key 只存本机 `localStorage`（可关闭「记住 Key」），不发送到本站 —— 本站没有后端
- 浏览器直连需服务商支持 CORS；不支持时页面会给出明确提示，需换接口或走本地代理
- 建议填限额密钥，不要填主账号密钥

## 页面

| 文件 | 说明 |
| --- | --- |
| `index.html` | AI 写作工作台（首页） |
| `essays.html` | 范文库：按年级/体裁筛选 + 关键词搜索 |
| `essay.html` | 范文详情：正文 + 逐篇点评 + 相关推荐（`?id=`） |
| `materials.html` | 素材库：写景/人物/情感/说理句子分类 |
| `tips.html` / `tip.html` | 写作方法列表与详情（`?id=`） |
| `about.html` | 平台介绍 |
| `404.html` | 404 页 |

## 结构

```
assets/css/style.css   全站样式系统（CSS 变量 + 响应式）
assets/css/write.css   工作台与方格稿纸样式
assets/js/prompt.js    AI 写作提示词（12 条铁律）
assets/js/write.js     工作台逻辑：配置、SSE 流式、稿纸渲染、复制下载
assets/js/data.js      数据：12 篇范文、8 组素材、6 篇方法
assets/js/app.js       内容页渲染、筛选、搜索、详情逻辑
CNAME                  自定义域名 wenyazw.top
.nojekyll              关闭 Jekyll 处理
```

## 本地预览

```bash
python -m http.server 8123
# 打开 http://127.0.0.1:8123
```

## 分支与发布

| 分支 | 用途 |
| --- | --- |
| `main` | 发布分支，GitHub Pages 从此分支根目录部署 |
| `dev` | 开发分支 |

发布流程：在 `dev` 上开发验证 → `git push origin dev` → `git push origin dev:main`（快进，不用强推，避免覆盖 `CNAME`）。

## 内容说明

站内范文为教学示例；AI 生成内容仅供参考。均请勿直接抄袭提交。

## 许可

保留所有权利。未经许可不得转载、镜像或商用；站内范文禁止抄袭提交。
