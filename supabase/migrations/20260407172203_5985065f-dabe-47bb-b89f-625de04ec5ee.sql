UPDATE center_payments SET amount = GREATEST(0, amount - COALESCE((
  SELECT wt.amount FROM wallet_transactions wt 
  WHERE wt.user_id = center_payments.driver_id 
  AND wt.type = 'debit' 
  AND wt.reason LIKE '%' || to_char(to_date(center_payments.payment_month, 'YYYY-MM'), 'FMMonth YYYY') || '%'
  LIMIT 1
), 0)) WHERE status = 'approved' AND EXISTS (
  SELECT 1 FROM wallet_transactions wt 
  WHERE wt.user_id = center_payments.driver_id 
  AND wt.type = 'debit' 
  AND wt.reason LIKE '%' || to_char(to_date(center_payments.payment_month, 'YYYY-MM'), 'FMMonth YYYY') || '%'
);