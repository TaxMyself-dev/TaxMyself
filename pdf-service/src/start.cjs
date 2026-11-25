// Readiness follows synthetic warmup; never publish a ready listener first.
async function startServer({render, server, port, host, warmup = process.env.PDF_WARMUP !== "false", logger = console.log}) {
  const started = performance.now();
  try {
    if (warmup) await render.warmup();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => { server.removeListener("error", reject); resolve(); });
    });
    try { logger(JSON.stringify({event:"pdf_service_ready", node:process.version, port,
      warmup, startupMs:Math.round(performance.now()-started)})); } catch {}
  } catch (error) {
    await render.close();
    throw error;
  }
}
module.exports = {startServer};
