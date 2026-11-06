-- Athena Curated Features Extraction Query
-- Partition pruning enforced: year, month, day
-- Cost Control: Scanning bounded Parquet columns only (Cost Posture: Principle I)

SELECT
    i.user_id,
    i.item_id,
    c.category,
    c.price_cents,
    -- Compute interaction weight: view=1.0, click=2.0, cart=3.0, purchase=5.0
    SUM(
        CASE i.event_type
            WHEN 'purchase' THEN 5.0
            WHEN 'add_to_cart' THEN 3.0
            WHEN 'click' THEN 2.0
            WHEN 'view' THEN 1.0
            ELSE 0.5
        END
    ) AS interaction_weight,
    COUNT(*) AS total_interactions,
    MAX(i.timestamp) AS last_interaction_epoch
FROM
    ecommerce_golden_db.interactions i
INNER JOIN
    ecommerce_golden_db.catalog c
    ON i.item_id = c.item_id
WHERE
    -- Enforce partition pruning to cap scanned bytes (< 100 MB per run)
    i.year = CAST(YEAR(CURRENT_DATE - INTERVAL '1' DAY) AS VARCHAR)
    AND i.month = LPAD(CAST(MONTH(CURRENT_DATE - INTERVAL '1' DAY) AS VARCHAR), 2, '0')
    AND i.day = LPAD(CAST(DAY(CURRENT_DATE - INTERVAL '1' DAY) AS VARCHAR), 2, '0')
    AND c.in_stock = true
GROUP BY
    i.user_id,
    i.item_id,
    c.category,
    c.price_cents
HAVING
    COUNT(*) >= 1;
