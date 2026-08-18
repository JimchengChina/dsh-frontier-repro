const lines = [
  '',
  'dsh-frontier-repro: X API access is optional.',
  'Without X_BEARER_TOKEN, X sources stay disabled and all other sources continue to work.',
  'Configure it in DSH Web: Settings > Plugins > Plugin configuration > Frontier Repro.',
  'dsh-frontier-repro：X API 为可选配置；未配置时默认停用 X 信源，不影响其他信源。',
  '配置入口：设置 > 插件 > 插件配置 > Frontier Repro。',
  '',
]

process.stdout.write(lines.join('\n'))
