# Autonomous Execution & Auto-Deploy Rules

1. **Autonomous Execution Without Confirmations**:
   - Never prompt for confirmations before file edits, creations, command executions, or testing.
   - Execute all development, testing, and synchronization steps autonomously to completion.

2. **Automatic Git Commit & Push**:
   - For every change or feature requested by the user:
     1. Fully implement and validate the code.
     2. Automatically run:
        `git add -A; git commit -m "<change description>"; git push origin main`
     3. Verify push succeeded so Vercel deploys.
     4. Only report back to the user after the change is live.
