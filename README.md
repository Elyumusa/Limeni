# LimaShift

Crop rotation guidance for Zambian farmers, built on NASA data.
NASA Space Apps 2026 — *Field Shift: Adapting Farms with NASA Data*.

**Read [PLAN.md](PLAN.md) first.** It lists the features, the data sources and the build phases.

```bash
npm install
npm run dev     # open http://localhost:3000
npm run data    # re-fetch NASA POWER data for the demo locations
```

## AI summary (optional)

The "Explain it with AI" button calls DeepSeek through `src/app/api/summary/route.ts`.
Without a key it shows the standard summary instead, so the app works either way.

The route reads `DEEPSEEK_API_KEY` from the environment. Locally, export it in your shell
(for example in `~/.zshrc`) before running `npm run dev`. On Vercel, add the same variable
under Project Settings → Environment Variables.
