# dsh-dockerfile-check

Dockerfile hygiene from one file. A Dockerfile is decidable: whether the **base image is pinned**, whether the container **ends up running as root**, whether a **secret was baked into a layer**, whether a plain copy used **ADD instead of COPY**, and whether each package-manager install **cleaned up after itself**.

<!-- install:start -->
## 装进 DSH

```bash
dsh plugin --profile <profile> add dsh-dockerfile-check
```

`--profile` 是 `dsh plugin` 的必填项（Desktop 用 `desktop`，Web 用 `web`）。装完在「插件」里启用，对话中就有这条检查的 host 路由；不装 DSH 也能用上面的 `npx`。
<!-- install:end -->

## 前置要求

Node.js ≥ 22.19，就是 `package.json` 里 `engines.node` 写的那一条；CLI 只依赖 Node，别的不装也能跑。想在对话里用同一个检查，需要 DSH `>=0.2.2-rc.1 <0.3.0-0`。装之前 `node -v` 看一眼，比装完再猜为什么报错快。

跑通大概 2 分钟。卡住了在仓库开 issue，别自己啃。

<!-- example:start -->
## 真实输入输出

输入：

```markdown
FROM node
ADD . /app
ENV API_KEY=sk-live-1234567890
CMD ["node", "index.js"]
```

真实运行（逐字输出，由测试与工具保持同步）：

```text
$ dockerfile-check Dockerfile.sample
error user-missing 第0行 没有任何 USER 指令——容器默认以 root 运行，镜像被拿下就是宿主 root
error base-unpinned 第1行 第 1 行基础镜像「node」没有固定标签或 digest——「node:latest」这类浮动标签让构建不可复现
error secret-in-layer 第3行 第 3 行把疑似密钥「API_KEY」写成了字面值——层历史永久保留，改用构建期 secret 或运行时注入
warn workdir-missing 第0行 没有 WORKDIR——相对路径会落在 /，后续 COPY 的位置容易看错
warn add-instead-of-copy 第2行 第 2 行用的是 ADD 但源不是 URL 也不是压缩包——COPY 语义更窄，读者不用猜
fail: 4 instructions, 3 errors, 2 warnings
```

出口码：1。
<!-- example:start -->

Listed in [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin).

## What it decides

| rule | level | meaning |
| --- | --- | --- |
| `from-missing` | error | no `FROM` — this is not a Dockerfile |
| `base-unpinned` | error | `FROM node` or `:latest` — a floating tag makes builds irreproducible (a `@sha256:` digest passes) |
| `user-missing` | error | no `USER` instruction — the container runs as root by default |
| `user-root` | error | `USER root` written explicitly is the same as not writing it |
| `secret-in-layer` | error | `ENV API_KEY=sk-…` — letter-value secrets stay in the layer history forever (`${API_KEY}` references pass) |
| `add-instead-of-copy` | warn | `ADD` of a plain local path — `COPY` has narrower semantics (tarballs and URLs are exempt) |
| `apt-not-cleaned` | warn | `apt-get install` without removing `/var/lib/apt/lists` |
| `apk-not-cleaned` | warn | `apk add` without `--no-cache` |
| `workdir-missing` | warn | no `WORKDIR` — relative paths land in `/` |

Instruction parsing handles case-insensitivity and backslash continuations, so a multi-line `RUN` is one instruction reported at its first line.

## Use

```bash
npx dsh-dockerfile-check Dockerfile --json
npx dsh-dockerfile-check Dockerfile --allow-latest --no-require-user
```

Same function over HTTP: `POST /dockerfile-check/api` with `{"text": "…"}` or `{"path": "…"}` — the CLI and the host route share one implementation, so they cannot disagree.

## Honest scope

This checks the Dockerfile's **text**, not the built image: it cannot see what a base image contains, whether the final stage is the one you meant, or whether `USER node` exists in the image at all. It verifies the file states the decisions; whether the image behaves as intended is what `docker scout`, a scan, and a run are for.
