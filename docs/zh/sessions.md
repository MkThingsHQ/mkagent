# 会话

会话是追加写入的 JSONL 记录，Pi 恢复数据存放在会话目录中。支持的操作包括新建、继续、取消、恢复、搜索、重命名、删除、flag、archive、未读追踪、导入/导出、分支以及在另一个窗口中打开。

技术状态包括 idle、processing、waiting for permission、failed 与 interrupted。内置 Views 提供未读、flag、运行中、已归档和待计划审核筛选，不引入用户 label 或自定义 status。

只有真正成为已注册、可打开的会话后，导入才算完成。导出包不包含 API key、代理凭证或加密凭证数据。
