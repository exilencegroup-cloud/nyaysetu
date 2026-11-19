/** @type {import('next').NextConfig} */
const { withWorkflow } = require('workflow/next');

const nextConfig = {
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.svg',
        permanent: true,
      },
    ];
  },
};

module.exports = withWorkflow(nextConfig);
