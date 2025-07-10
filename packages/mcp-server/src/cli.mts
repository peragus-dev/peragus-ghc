#!/usr/bin/env node

import { startServer } from './index.mjs';

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the MCP server
startServer().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});