// Vercel serverless entrypoint that reuses the existing Express app
const app = require('../server');

// Export a handler so @vercel/node invokes Express correctly
module.exports = (req, res) => app(req, res);
