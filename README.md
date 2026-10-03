# learn-anew

小学、初中知识的讲解动画。做给课堂和自学当辅助，也是自己把学过的东西再做一遍：温故，并且在做的过程里知新。

## 直接看、直接下载

不用装开发工具。

- 在线看：<https://luckinov.github.io/learn-anew/>
- 下载到电脑：打开 [Releases](https://github.com/luckinov/learn-anew/releases/latest)，下载 `learn-anew-obfuscated.zip`，解压后用浏览器打开里面的 `index.html`

「物态变化 · 3D」第一次打开需要联网。讲解语音已经打在压缩包里，解压后可以离线听。

在线页面只放三维版 `states-of-matter/3d.html`。平面版不部署，需要时从 Release 压缩包里打开 `states-of-matter/index.html`。仓库里是原始源码，网页和 Release 压缩包是混淆后的分享版。

## 重新打包

在仓库根目录执行：

```bash
npm install
npm run build
```

产物在 `release/`，不会提交进仓库。上线哪些页、卡片上的年级和科目，来自每个动画目录里的 `meta.json`。`states-of-matter` 里原来的 `npm run build` 仍然只打包那个目录的 2D 页。

## 维护

给人看的说明在 [docs/架构与维护.md](docs/架构与维护.md)：目录怎么分、怎样标人教版的年级和科目、怎样加一个动画、H5 怎样部署。

每个动画文件夹里有一份 `meta.json`。没写课本标注时，`npm run build` 不会通过。

## 协议

知识共享 署名-非商业性使用-相同方式共享 4.0 国际（[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh)）。法律文本在 [LICENSE](LICENSE)。

可以复制、修改，也可以在课堂、学校和个人学习里使用。请保留署名，并注明改过哪里。朋友接着做的版本，也要用同一协议公开。

不要用于商业目的：不要出售这些动画，不要放进收费产品，也不要拿去给商业服务做宣传。

提交到这个仓库，即表示该贡献也按这个协议共享。第三方库仍遵守它们各自的协议。
