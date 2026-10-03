# learn-anew

小学、初中知识的讲解动画。做给课堂和自学当辅助，也是自己把学过的东西再做一遍：温故，并且在做的过程里知新。

## 直接看、直接下载

不用装开发工具。

- 在线看：<https://luckinov.github.io/learn-anew/>
- 下载到电脑：打开 [Releases](https://github.com/luckinov/learn-anew/releases/latest)，下载 `learn-anew-obfuscated.zip`，解压后用浏览器打开里面的 `index.html`

「物态变化 · 3D」第一次打开需要联网。

## 目录

| 目录 | 内容 |
|---|---|
| `states-of-matter/` | 固液气物态变化。`index.html` 是 2D 版，`3d.html` 是 3D 版 |
| `sorting-visualizer/` | 排序算法可视化 |
| `fractal/` | 无限分形探索器 |
| `svg-demo/` | SVG 能力演示 |

仓库里这些文件是原始源码。上面的网页和 Release 压缩包是混淆后的分享版，方便别人打开，不方便直接对照着读代码。

## 重新打包

在仓库根目录执行：

```bash
npm install
npm run build
```

产物在 `release/`，不会提交进仓库。`states-of-matter` 里原来的 `npm run build` 仍然只打包那个目录的 2D 页。
