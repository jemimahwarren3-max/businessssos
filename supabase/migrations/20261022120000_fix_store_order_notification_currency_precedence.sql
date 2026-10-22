do $$
declare
  _definition text;
  _old_expression text := $old$_name || ' · ' || _priced->>'currency' || ' ' || (_priced->>'total')$old$;
  _new_expression text := $new$_name || ' · ' || (_priced->>'currency') || ' ' || (_priced->>'total')$new$;
begin
  select pg_get_functiondef(
    'public.create_store_order(text, text, jsonb, jsonb, text, text, timestamptz)'::regprocedure
  )
  into _definition;

  if position(_old_expression in _definition) > 0 then
    execute replace(_definition, _old_expression, _new_expression);
  elsif position(_new_expression in _definition) = 0 then
    raise exception 'Expected create_store_order notification expression was not found.';
  end if;
end
$$;
