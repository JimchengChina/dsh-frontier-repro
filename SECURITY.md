# Security

Report vulnerabilities privately to the repository maintainer before public disclosure.

The plugin reads public sources and writes one local JSON corpus. Do not place secrets in custom source URLs, evidence notes, executed commands, artifacts, or metrics. X credentials must be supplied through the configured credential reference and are never persisted by this plugin.

Custom source files are trusted administrator configuration. Keep them outside model-writable directories when the model has broad filesystem access. For untrusted networks or multi-tenant deployments, add an OS/container egress allowlist in addition to the plugin's HTTPS, redirect, timeout, and byte-limit checks.
