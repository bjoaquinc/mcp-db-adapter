# Security-First MCP Database Adapter

A lightweight, open-source connector stub written in **TypeScript** that **leverages AI** to auto-discover database connections in any JavaScript, Python, or SQL project and spins up a **local MCP gateway**. Expose two core tools—**safe\_execute** and **schema\_validation**—feeding AI coding assistants (Cursor, Windsurf, Void, Continue) with **real-time, schema-aware** database insights.

---

## 📖 Overview

This adapter integrates seamlessly into your existing Model Context Protocol setup via the `mcp.json` configuration. It:

* **AI-Driven Discovery**: Uses your AI assistant to locate connection strings or config objects in code and environment files.
* **Reachability Check**: Verifies the database endpoint is online (via a lightweight driver handshake).
* **Local MCP Gateway**: Starts on `localhost:<port>`, proxying read-only operations.
* **Core Tools**:

  * **safe\_execute**: Runs SQL in a **rolled-back** transaction context, returning sample rows, errors, and EXPLAIN plans.
  * **schema\_validation**: Fetches live schema metadata (tables, columns, types, constraints, indexes).

These tools enable your AI workflows to generate, validate, and optimize database code against your actual environment, without risking unintended writes.

---

## 🔧 Installation & Usage

You don’t need to permanently add this adapter as a dependency. You can invoke it via **NPX** or **Docker**, just like other MCP servers:

### NPX (Recommended)

Add the adapter to your `mcp.json` under `mcpServers`, supplying your database URL directly as an argument:

```json
{
  "mcpServers": {
    "mcp-db-adapter": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-db-adapter",
        "--port 6000"
      ]
    }
  }
}
```

To launch, use your IDE or CLI that reads from `mcp.json` (e.g., VS Code MCP extension). Alternatively, run directly:

```bash
npx -y mcp-db-adapter --port 6000
```

This will start the local MCP gateway on port `6000`, auto-discover your connection via AI-driven parsing, verify reachability, and register `safe_execute` & `schema_validation`.

---

## 📄 License

Licensed under Apache 2.0. See [LICENSE](LICENSE) for details.
