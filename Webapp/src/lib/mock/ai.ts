/** Canned, keyword-matched replies so the chat UI can be demoed without an LLM. */
export type AiContext = { kind: "recipe"; id: string; title: string; kcal?: number; proteinG?: number };

export const SUGGESTED_PROMPTS = [
  "How much protein do I need per day?",
  "Best vegan sources of iron?",
  "Should I take B12?",
  "Swap for eggs in baking?",
];

const RULES: { match: RegExp; reply: (ctx?: AiContext) => string }[] = [
  {
    match: /protein/i,
    reply: (ctx) =>
      (ctx?.proteinG
        ? `**${ctx.title}** gives about **${ctx.proteinG} g protein** per serving.\n\n`
        : "") +
      "Most adults do well with **0.8–1.2 g protein per kg** body weight; active people aim higher.\n- Tofu & tempeh: 12–20 g / 100 g\n- Lentils: 18 g per cooked cup\n- Seitan: ~25 g / 100 g\nPair legumes with grains across the day for a complete amino-acid profile.",
  },
  {
    match: /iron/i,
    reply: () =>
      "Top plant iron sources:\n- Lentils & chickpeas\n- Tofu (calcium-set)\n- Pumpkin seeds\n- Dark leafy greens\nAdd **vitamin C** (lime, peppers, tomatoes) to the same meal — it can boost absorption 2–3×. Avoid tea/coffee right with iron-rich meals.",
  },
  {
    match: /b12/i,
    reply: () =>
      "Yes — **B12 is the one supplement every vegan should take.** Common schedules: 50–100 µg daily or 2,000 µg weekly (cyanocobalamin is the most studied). Check with your doctor if blood levels are low.",
  },
  {
    match: /egg|bak/i,
    reply: () =>
      "Egg swaps (per egg):\n- **Flax egg:** 1 tbsp ground flax + 3 tbsp water, rest 5 min\n- **Aquafaba:** 3 tbsp chickpea water — great for meringues\n- **Banana/applesauce:** ¼ cup, best in sweet bakes",
  },
  {
    match: /calor|kcal|weight|lose/i,
    reply: (ctx) =>
      (ctx?.kcal ? `This recipe is about **${ctx.kcal} kcal** per serving.\n\n` : "") +
      "For a sustainable deficit, most people aim ~300–500 kcal below maintenance. Use the **Meal Planner** to set a daily target — it totals each day for you.",
  },
];

export function mockAiReply(prompt: string, ctx?: AiContext): string {
  const rule = RULES.find((r) => r.match.test(prompt));
  if (rule) return rule.reply(ctx);
  if (ctx)
    return `Looking at **${ctx.title}**: it's a balanced plant-based meal${ctx.kcal ? ` (~${ctx.kcal} kcal, ${ctx.proteinG} g protein per serving)` : ""}.\n- Add edamame or extra tofu to raise protein\n- Serve with brown rice for more fibre\n- Swap tamari for soy sauce if you don't need it gluten-free`;
  return "Great question! I can help with macros, vitamins (B12, iron, D, omega-3), ingredient swaps and meal ideas. Try asking about a specific recipe or nutrient.";
}
