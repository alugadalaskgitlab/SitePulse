# DIESEL-02

## Part 1 — requisition numbers

Added one display-only formatter: `DSL-REQ/<Indian financial year>/<id padded to 4>`. Requirements, detail/purchase headers, receipt picker, purchase register, direct-fill/choice labels and the requirements Excel workbook use it. The existing comparison workbook is unchanged; Export requirements uses the existing export permission.

Direct-fill responses carry the requisition date so a fill in a later financial year still displays the original requisition number. This is response metadata only, not a stored field.

Focused tests: **51 passed (6 files)**. Build passed. No migration, database connection or database write was made.
