// Vercel serverless entrypoint that reuses the existing Express app
const app = require('../server');

module.exports = app;
