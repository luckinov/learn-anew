# learn-anew

小学、初中知识的讲解动画。做给课堂和自学当辅助，也是自己把学过的东西再做一遍：温故，并且在做的过程里知新。

| 目录 | 内容 |
|---|---|
| `states-of-matter/` | 固液气物态变化。`index.html` 是 2D 版，`3d.html` 是 3D 版 |
| `sorting-visualizer/` | 排序算法可视化 |
| `fractal/` | 无限分形探索器 |
| `svg-demo/` | SVG 能力演示 |

`states-of-matter` 的依赖和混淆后的发布页不入库。要重新打开发布包时，进入该目录执行 `npm install && npm run build`，产物在 `release/index.html`。

## 连上 GitHub

网络正常后，在 GitHub 新建空仓库，名字用 `learn-anew`。创建时只填仓库名。公开或私有按你自己的选择。

然后在本目录执行，把 `<用户名>` 换成你的 GitHub 用户名：

```bash
git init -b main
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/<用户名>/learn-anew.git
git push -u origin main
```

如果当时已经装了 GitHub CLI，初始化并提交之后也可以一条命令建仓库并推送：

```bash
gh repo create learn-anew --source=. --remote=origin --push
```

公开仓库加上 `--public`，私有仓库加上 `--private`。
