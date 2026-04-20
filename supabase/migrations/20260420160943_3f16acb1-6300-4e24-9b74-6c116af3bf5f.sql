WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(name))
      ORDER BY (status = 'approved') DESC, created_at ASC
    ) AS rn
  FROM public.named_locations
)
DELETE FROM public.named_locations
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);