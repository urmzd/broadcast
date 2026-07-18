#!/usr/bin/env node
import { main } from "../mcp.js";

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
