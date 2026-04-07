# E-commerce Customer Service KB Seeds

This folder contains a small, curated seed corpus for the e-commerce customer service RAG MVP.

## Included files

- `vtex-return-policy.md`
  - Source: https://github.com/vtex-apps/return-app
  - Why it matters: return requests, refund options, exclusions, status updates

- `saleor-order-status.mdx`
  - Source: https://github.com/saleor/saleor-docs
  - Why it matters: order lifecycle and status explanations

- `saleor-refunds.mdx`
  - Source: https://github.com/saleor/saleor-docs
  - Why it matters: refund-related knowledge and payment behavior

- `saleor-shipping-methods-in-orders.mdx`
  - Source: https://github.com/saleor/saleor-docs
  - Why it matters: shipping methods and order-delivery-related knowledge

## Notes

- These files are knowledge-text seeds, not transactional databases.
- For the MVP, ingest this folder first instead of the full repos.
- The content is mostly English. If the target demo is Chinese, add a query rewrite or translation layer, or build a Chinese FAQ layer on top of these sources.
