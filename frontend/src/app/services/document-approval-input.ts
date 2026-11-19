export function hasRequiredDocumentInput(fields: {
  amount: number | string | null | undefined;
  date: string | null | undefined;
}): boolean {
  if (
    fields.amount == null ||
    String(fields.amount).trim() === "" ||
    !Number.isFinite(Number(fields.amount)) ||
    !fields.date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.date)
  )
    return false;
  const date = new Date(fields.date);
  return (
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === fields.date
  );
}
