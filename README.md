# Archetype Reading

An interactive self-reading based on Caroline Myss's [Gallery of Archetypes](https://myss.com/free-resources/sacred-contracts-and-your-archetypes/appendix-a-gallery-of-archtypes/), in four movements:

1. **The Gallery** — swipe through all 91 archetypes; keep the ones you recognize in yourself.
2. **The Shadow** — look back through the pile you rejected and reclaim what you were reluctant to admit.
3. **Innate or Adaptive** — narrow to 8 by keeping what you can't help being over what you've merely learned.
4. **The Roundtable** — arrange your final archetypes around a table by closeness and alliance, and export it as an image.

Runs entirely in the browser — no backend, no accounts, nothing stored.

**Live:** https://archetype-reading.onrender.com

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Playwright smoke test
npm run extract  # regenerate src/data/archetypes.ts from gallery.pdf
```

Built with Vite, React, TypeScript, Tailwind CSS v4, and framer-motion. See [CLAUDE.md](CLAUDE.md) for architecture notes.
