ALTER TABLE public.moallem_payments
  ADD COLUMN IF NOT EXISTS package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL;

UPDATE public.moallem_payments mp
SET package_id = b.package_id
FROM public.bookings b
WHERE mp.booking_id = b.id
  AND mp.package_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_moallem_payments_package_id
  ON public.moallem_payments(package_id);
