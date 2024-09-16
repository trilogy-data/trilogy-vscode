# Trilogy Language Tools (Alpha)

VSCode language tools for the Trilogy language, an experiment in more delightful SQL.

It provides these VSCode features:
- Syntax Highlighting
- Codelens
- Syntax Validation
- Query Rendering

At some point, it should provide
- Query execution
- GOTO
- Test support

## What is Trilogy?

Trilogy is a simpler SQL for analytics; SELECT queries looks like SQL but run against a lightweight semantic model defined in the same language, instead of tables.

Trilogy looks like this:

```sql
SELECT
    revenue,
    revenue_from_top_customers,
    revenue_from_top_customers / revenue as revenue_from_top_customers_pct
WHERE
    product_line in ('widgets', 'doodads')
```


## Installation

Install from VSCode extension tooling.