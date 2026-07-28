# Data directory

The default root is `~/.mkagent`. Set `MKAGENT_CONFIG_DIR` to isolate tests or development. MkAgent never reads or migrates data from other products.

The root contains global configuration, encrypted credential storage, logs, tool icons, global Skills, and `workspaces/`. Each workspace contains sessions, Pi recovery files, workspace Skills, permissions, and related local state.

Back up the directory only while the application is stopped or after sessions have been flushed.
