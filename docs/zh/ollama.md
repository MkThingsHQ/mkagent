# Ollama

启动 Ollama,拉一个模型,然后到 Settings 加一条自定义连接即可。

## 添加连接

```text
Provider:        Custom
Name:            Local Ollama(或自定义)
Base URL:        http://127.0.0.1:11434/v1
Protocol:        openai-completions
API key:         (空)
Default model:   已安装的 Ollama 模型名,如 llama3.2
```

保存后点击 "Test"。成功返回模型列表。

## MkAgent 如何用 Ollama

Ollama 作为 `openai-completions` 连接注册。session 启动时,Pi 的 provider 解析这条连接 id,并以空 auth 把所有模型调用路由过去。streaming、thinking-level、工具调用、权限弹窗、cancel、resume 全部由 Pi 统一管理;MkAgent 没有给 Ollama 单独的旁路。

这意味着:

- 绑定到 Ollama 的会话可以使用 Pi 自带的工具(bash、read、edit、grep 等)以及连接配置的模型。
- 需要工具调用就必须选支持 tool 的模型;不支持的会拒绝调用。
- 流式和"思考"风格输出就是模型给什么显示什么;Ollama 侧的 "thinking" 不会被解析进 renderer。

## 验证

```bash
# 在 shell 里 sanity check
curl http://127.0.0.1:11434/v1/models

# 通过 MkAgent CLI 验证
bun run apps/cli/src/index.ts connections list
bun run apps/cli/src/index.ts connections test <id>
bun run apps/cli/src/index.ts run "Hello" \
  --provider ollama --base-url http://127.0.0.1:11434/v1 --model llama3.2
```

## 权限

使用 Ollama 的连接仍然要走共享的权限引擎。即使模型本身跑在本地,在允许名单之外读 / 写的工具调用也会先弹权限。

## 限制

- Ollama 的 OpenAI-兼容 surface 缺一些 MkAgent 可能发的字段(尤其是并行工具调用与某些 reasoning payloads)。某些 Ollama 模型会把工具调用报成纯文本;agentic 会话请选支持 tool 的模型。
- 网络访问是本地的;即使配置了代理,`127.0.0.1` 也不走代理。
- 多模型连接不能跨 provider 拆开;一个 Ollama base URL 对应一条连接。
