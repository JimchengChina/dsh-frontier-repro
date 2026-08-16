# Source policy

## Admission rules

A built-in source must be one of:

1. A primary paper endpoint operated by the repository itself, currently arXiv Atom.
2. A laboratory-controlled domain publishing research, engineering, safety, model, or product information.
3. A verified organization page hosting code, models, datasets, or model cards.
4. A named founder/core person's own blog or X account, with a separate first-party lab page establishing current identity and role.

The plugin does not ingest media, SEO summaries, anonymous reposts, generic X search, influencer accounts, or arbitrary URLs supplied by the model.

## Provenance fields

Every record retains its source id/class, lab, canonical URL, source endpoint, collection time, and any person identity evidence. Ranking never removes these fields. Cross-source duplicates retain the first normalized record and list corroborating source ids.

Person identities can change. The built-in catalog is conservative and should be re-audited on releases. When a reliable, lab-verifiable public channel does not exist, absence is preferred to a guessed account.

## Source classes

`official_lab` and `official_artifact` receive the highest source score, followed by primary papers, person blogs, then person X posts. This order reflects suitability for implementation evidence, not a judgment that a laboratory claim is automatically true.

## X

X collection uses `GET /2/users/by/username/:username` and `GET /2/users/:id/tweets` with a user-provided bearer token. There is no cookie reuse, browser automation, proxy, RSS bridge, or scraping fallback. Account access, rate limits, and pricing are external conditions and are reported as source failures without stopping other sources.

## Network safety

Only HTTPS is accepted. Literal loopback, link-local, and private IP targets plus embedded credentials are rejected; redirects are revalidated; every response has a time and byte limit. Custom source files are trusted administrator input and cannot be supplied through model tool arguments. Deployments with stronger egress requirements should enforce an outbound allowlist at the OS/container boundary as well.

## Content use

The corpus stores bounded titles, metadata, summaries, and outbound artifact URLs. It does not archive full articles or PDFs. Follow each source's terms, robots policy, API agreement, artifact license, and data restrictions.
