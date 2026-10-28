const safeId = id => /^[a-z0-9][a-z0-9-]{5,63}$/i.test(id);
const isObj = v => Boolean(v) && typeof v === "object" && !Array.isArray(v);
module.exports = { safeId, isObj };
