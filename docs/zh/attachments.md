# 附件

Desktop 支持文件选择、粘贴、拖放、持久化与恢复。WebUI 上传走经过鉴权的 multipart 端点,会校验文件数、大小与安全文件名,然后进入同一份附件读取流水线。

## 来源

| 来源 | 位置 |
|---|---|
| 文件选择器 | Desktop 聊天底部 → Attach 按钮 |
| 粘贴 | 在聊天输入框 Cmd/Ctrl-V |
| 拖放 | 把 Finder/Explorer/Nautilus 中的文件拖到聊天界面 |
| 持久化 | session resume 时从 `sessions/<id>/attachments/` 恢复 |
| WebUI 上传 | `POST /api/attachments` on the headless server |
| CLI | `send <session-id> --attachment <path>` |

所有路径最终都汇聚到 `@mkagent/shared/agent/attachments` 的同一份附件校验器。

## 校验

| 字段 | 规则 |
|---|---|
| 单文件大小 | 默认最多 50 MB,按 workspace 可配 |
| 单个 session 累计 | 不限,但 JSONL 单事件超过 1 MB 会被截断 |
| 文件名 | Unicode 归一化后必须匹配 `/^[A-Za-z0-9._-]+$/`,path traversal 段被拒 |
| MIME sniffing | 读前 1 KB 嗅探,声明的 MIME 与嗅探结果冲突且有可疑性时被覆盖 |
| 存储根 | 强制限在 `~/.mkagent/workspaces/<slug>/sessions/<id>/attachments/` |

校验失败会在 JSONL 上落 `permission_denied` / `validation_failed` 事件,在 renderer 上弹一致的 toast。

## 读取流水线

落盘后,附件以类型化描述符暴露给 Pi:

```ts
type Attachment = {
  id: string         // UUIDv4
  filename: string   // safe form
  mimeType: string   // sniffed
  size: number       // bytes
  storagePath: string// sessions/<id>/attachments/ 下的绝对路径
  uploadedAt: number // epoch ms
}
```

每个工具调用都收到这个描述符;实际文件内容由真正想读的 tool 自行读取。Pi 看不见上传表单,只看校验过的描述符。

## 图片附件

图片可以附加、预览并在 Markdown 中渲染。renderer 用 `sharp` 做 re-encode,Shiki / KaTeX 做 code 与 math 渲染。MkAgent **不**包含图片生成模型或 `gen_image` 工具。

## 持久化

附件与会话一同持久化。删除会话后,附件在 trash 保留期过后清理。导出会打包附件;导出包是单个 zip,导入时会重新校验每个文件。

## 安全

- 路径规范化在写入前剔除 `..` 段。
- 符号链接在上传时解析;POSIX 上等价 `O_NOFOLLOW` 的语义。
- `(/tmp/mkagent-*` 这类 staged 路径不能逃出 workspace 根。
- WebUI cookie session;上传端点与 RPC 用同一个 JWT。
- Sentry breadcrumbs 对形如凭证字段的文件名脱敏,不会上报。

## 限制

- 不支持超过 50 MB 的流式上传;单文件是基本单元,且可配。
- 图片 EXIF 保留;如果希望脱敏,在 attach 前用外部工具处理。
