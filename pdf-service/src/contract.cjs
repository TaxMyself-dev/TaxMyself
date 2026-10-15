const { randomUUID } = require("node:crypto");
const MAX_INPUT = 8 * 1024 * 1024;
class RenderError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
function validateJob(job) {
  const invalid = () => {
    throw new RenderError("INVALID_RENDER_JOB", 400);
  };
  if (
    !job ||
    job.version !== 1 ||
    typeof job.requestId !== "string" ||
    !/^[a-zA-Z0-9-]{1,64}$/.test(job.requestId)
  )
    invalid();
  const model = job.document;
  if (
    !model ||
    typeof model !== "object" ||
    Array.isArray(model) ||
    typeof model.preview !== "boolean"
  )
    invalid();
  for (const field of ["title", "documentType", "date"])
    if (typeof model[field] !== "string" || model[field].length > 8192)
      invalid();
  for (const field of [
    "issuerName",
    "issuerDetails",
    "recipientName",
    "recipientTaxNumber",
    "subtitle",
    "note",
    "allocation",
  ]) {
    if (
      model[field] != null &&
      (typeof model[field] !== "string" || model[field].length > 16384)
    )
      invalid();
  }
  for (const field of ["items", "totals", "payments", "paymentTotals"]) {
    const rows = model[field];
    if (!Array.isArray(rows) || rows.length > 1000) invalid();
    for (const row of rows) {
      if (
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        Object.keys(row).length > 16
      )
        invalid();
      for (const [key, value] of Object.entries(row))
        if (
          key.length > 128 ||
          typeof value !== "string" ||
          value.length > 16384
        )
          invalid();
    }
  }
  if (
    model.logoDataUri != null &&
    (typeof model.logoDataUri !== "string" ||
      !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(
        model.logoDataUri
      ))
  )
    invalid();
  if (Buffer.byteLength(JSON.stringify(job)) > MAX_INPUT)
    throw new RenderError("RENDER_JOB_TOO_LARGE", 413);
  return job;
}
module.exports = {
  MAX_INPUT,
  RenderError,
  validateJob,
  newRequestId: randomUUID,
};
