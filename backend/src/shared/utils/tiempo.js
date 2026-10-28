const dormir = (ms, signal) => new Promise(r => {
  const t = setTimeout(r, ms);
  if (signal) signal.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true });
});
module.exports = { dormir };
