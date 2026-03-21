export const logger = {
  info(msg, meta) {
    if (meta !== undefined) console.log(`[info] ${msg}`, meta);
    else console.log(`[info] ${msg}`);
  },
  error(msg, err) {
    console.error(`[error] ${msg}`, err);
  },
};
