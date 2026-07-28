# Sessions

Sessions are append-oriented JSONL records with Pi recovery data in the session directory. Supported operations include create, continue, cancel, resume, search, rename, delete, flag, archive, unread tracking, import/export, branch, and opening in another window.

Technical states include idle, processing, waiting for permission, failed, and interrupted. Built-in Views filter unread, flagged, running, archived, and plan-review work without introducing user labels or custom statuses.

An import is accepted only when it becomes a registered, openable session. Exports omit API keys, proxy credentials, and encrypted credential data.
