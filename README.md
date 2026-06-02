<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/d951ad1f-fc7a-451b-9f39-d8af120de888

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `OPENAI_API_KEY` in `.env.local` to your OpenAI API key (optional:
   `OPENAI_MODEL`, defaults to `gpt-4o-mini`). The app still works without a key —
   AI features fall back to offline content and a deterministic, safe session plan.
3. Run the app:
   `npm run dev`
