ALTER TABLE public.supplier_agent_payments
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_supplier_agent_payments_package_id
  ON public.supplier_agent_payments(package_id);
