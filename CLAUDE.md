# Agent instructions

This is a 6-hour hackathon project. The full design spec is imported below and is the source of truth.

@DESIGN_SPEC.md

## Rules for agents
- Follow the API contract (§6), module signatures (§7), and tile text convention (§4.2) exactly. If a change is truly needed, update `DESIGN_SPEC.md` in the same change and tell the user to announce it to the team.
- Stay inside the files owned by the person you're working for (§11). Ask before touching another owner's files.
- Favor the simplest thing that works for the live demo. Don't add features from §15 unless asked.
- Never commit `.env` files or keys. The backend uses the Supabase service role key, so filter every query by `user_id`.
- Dev machines run Windows. Write commands that work in PowerShell or Git Bash.
