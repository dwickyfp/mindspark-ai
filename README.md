# Mind Spark

Mind Spark is an open-source AI collaboration workspace. It brings chat, shareable agents, visual workflows, and MCP-powered tools together so teams can collaborate with large language models in real time.

## Highlights

- **Multi-provider chat** with OpenAI, Anthropic, Google, Groq, xAI, Ollama, and more
- **Multimodal prompts** with inline file attachments (images, PDFs, and audio) routed through OpenRouter
- **Team workspaces** for inviting members, sharing MCP servers, and tracking usage analytics
- **Drag-and-drop workflows** that mix LLM reasoning with MCP tool execution
- **Custom agents** that package instructions, toolkits, and presets for specific tasks
- **Voice-ready assistant** powered by the OpenAI Realtime API
- **Self-host friendly** with Docker, PostgreSQL, and straightforward environment configuration

## Quick Start

```bash
git clone https://github.com/dwickyfp/mindspark-ai.git
cd mindspark-ai
pnpm install
```

1. Duplicate `.env.example` to `.env.local` and add your `POSTGRES_URL` plus at least one LLM provider key (e.g., `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`).
2. Start PostgreSQL locally (or edit the connection string to point to your own instance).
3. Launch Mind Spark:
   ```bash
   pnpm build:local && pnpm start     # production-style run
   # or
   pnpm dev                           # hot reload for development
   ```
4. Visit <http://localhost:3000> and complete the onboarding flow.

To run everything in containers:

```bash
pnpm docker-compose:up
```

This command starts PostgreSQL, Redis, and the Mind Spark app using `docker/compose.yml`.

## Architecture Overview

Mind Spark is built with Next.js (App Router) and the Vercel AI SDK. Core components include:

| Layer    | Description                                                                 |
| -------- | --------------------------------------------------------------------------- |
| UI       | React components with Tailwind, Radix, and SWR.                             |
| API      | Next.js route handlers for chat, agents, workflows, MCP, and organizations. |
| AI       | Model registry, MCP client manager, workflow executor, and tool adapters.   |
| Data     | Drizzle ORM with PostgreSQL for chats, agents, workflows, and usage logs.   |
| Optional | Redis for multi-instance synchronization.                                   |

Source layout highlights:

- `src/app` – application routes, API handlers, authentication, and layout scaffolding
- `src/components` – dashboards, editors, dialogs, and reusable UI elements
- `src/lib/ai` – model definitions, MCP manager, workflow engine, and prompts
- `src/lib/db` – Drizzle schema, migrations, and repository layer
- `src/types` – shared TypeScript contracts between server and client

## What You Can Build

- **Visual workflows** that expose complex tool chains as `@workflow_name` commands inside chat.
- **Browser automation** by connecting third-party MCP servers such as Microsoft’s Playwright connector.
- **Task-specific agents** that bundle instructions, context, and tool permissions for your team.
- **Voice-enabled assistants** that converse while orchestrating MCP tool calls in the background.
- **Tool presets and mentions** so operators can toggle between minimal and full capability sets.
- **Organization analytics** that aggregate token usage, tool favorites, and member activity.

## Environment Reference

| Variable                                    | Purpose                                              |
| ------------------------------------------- | ---------------------------------------------------- |
| `POSTGRES_URL`                              | PostgreSQL connection string (required).             |
| `BETTER_AUTH_SECRET`                        | Secret used by Better Auth (required).               |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc. | Enable individual model providers.                   |
| `NOT_ALLOW_ADD_MCP_SERVERS`                 | Set to `1` to restrict MCP server management.        |
| `DISABLE_SIGN_UP`                           | Set to `1` to prevent self-service account creation. |

See `.env.example` for the complete list.

## Documentation

- `docs/tips-guides/mcp-server-setup-and-tool-testing.md` – add and validate MCP servers
- `docs/tips-guides/docker.md` – containerized deployment walkthrough
- `docs/tips-guides/vercel.md` – deploy Mind Spark to Vercel
- `docs/tips-guides/system-prompts-and-customization.md` – tune prompts, preferences, and workflow instructions
- `docs/tips-guides/oauth.md` – enable Google, GitHub, and Microsoft sign-in
- `docs/tips-guides/e2e-testing-guide.md` – run end-to-end tests with Playwright

## Roadmap

- [x] File upload and multimodal responses
- [ ] Collaborative document editing and shared canvases
- [ ] Retrieval-augmented generation with your own knowledge base
- [ ] WebContainer integration for browser-contained compute

Have an idea? Open an issue or share it in the community Discord.

## Contributing

We welcome contributions of all sizes. Before you start:

1. Review `CONTRIBUTING.md` for coding and workflow guidelines.
2. Create an issue to discuss significant features or architectural changes.
3. Run `pnpm lint`, `pnpm check-types`, and `pnpm test` before submitting a PR.

## Community

- Star the repository to follow releases and new features
- Share your workflows, MCP integrations, and automation stories!

---

© 2025 Mind Spark. Built with ❤️ by the community.
