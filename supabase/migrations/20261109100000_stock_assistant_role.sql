-- Must run alone: new enum labels are not visible until this transaction commits.
alter type public.app_role add value if not exists 'stock_assistant';
