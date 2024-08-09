# Trilogy Language Tools (Alpha)

VSCode language tools for the Trilogy Language.

- Syntax Highlighting
- Codelens
- Syntax Validation

Trilogy is the better SQL for analytics; SELECT queries looks like SQL without the where clause and run against lightweight semantic model defined in the same language.

```sql

SELECT
    product_line,
    revenue,
    revenue_from_top_customers,
    revenue_from_top_customers / revenue as revenue_from_top_customers_pct
WHERE
    product_line in ('widgets', 'doodads')



```

## Installation

Install from VSCode