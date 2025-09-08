# Git Assistant Notes - Critical Workarounds

## 🚨 **CRITICAL: Git Terminal Integration Issues**

**Date Created**: January 2025  
**Problem**: Cursor's terminal integration with git commands consistently fails, getting stuck in pager views and interactive prompts.

## ❌ **What DOESN'T Work**

### Terminal Commands That Always Fail:
- `git status` (gets stuck in pager)
- `git log` (gets stuck in pager) 
- `git branch` (gets stuck in pager)
- `git --no-pager status` (still gets stuck)
- `git config --global pager.status false` (still gets stuck)
- Any complex git command chains
- Commands with `&&` operators in PowerShell

### Why These Fail:
- Git output triggers interactive pager mode
- PowerShell integration issues with git's output handling
- Terminal session gets stuck waiting for user input that can't be provided
- Commands appear to "hang" indefinitely

## ✅ **What DOES Work - The Manual Method**

### When Git Commands Are Needed:

**STOP** trying to run git commands through the terminal tool.

**INSTEAD**: 
1. **Provide the user with exact commands to run manually**
2. **Give clear step-by-step instructions**
3. **Include the working directory path**

### Template for Git Instructions:

```markdown
**Here's what you need to run in your own terminal:**

```bash
cd C:\foundryvttstorage\Data\modules\[module-name]
git add .
git commit -m "Descriptive commit message"
```

**That's it.** Simple, direct, no fancy automation.
```

### Example Successful Interaction:

**Instead of trying**: Complex terminal automation that fails
**Do this**: Give user simple manual commands
**Result**: User runs commands successfully, work gets committed

## 🎯 **Best Practices for Git Operations**

### 1. Always Use Manual Method
- Never attempt git commands through terminal tool
- Always provide exact commands for user to run
- Include full working directory paths

### 2. Commit Message Guidelines
- Keep messages concise but descriptive
- Include key features/fixes in the message
- Use present tense ("Add feature" not "Added feature")

### 3. When to Commit
- After major features are complete and tested
- When module is in a stable, usable state
- Before major refactoring or risky changes

## 📋 **Standard Git Workflow for Modules**

### For New Commits:
```bash
cd C:\foundryvttstorage\Data\modules\[module-name]
git add .
git commit -m "Brief description of changes"
```

### For Checking Status (if needed):
```bash
cd C:\foundryvttstorage\Data\modules\[module-name]
git status
```

### For Viewing History (if needed):
```bash
cd C:\foundryvttstorage\Data\modules\[module-name]
git log --oneline -5
```

## 🔧 **Emergency Git Recovery**

### If Git Repository Gets Corrupted:
1. Navigate to module directory manually
2. Check if `.git` folder exists
3. If needed, reinitialize: `git init`
4. Re-add remote if needed: `git remote add origin [url]`

### If Files Aren't Being Tracked:
1. Check `.gitignore` for overly broad exclusions
2. Use `git add -f [file]` to force-add if needed
3. Verify with `git status` before committing

## 💡 **Key Lessons**

1. **Manual is Better**: User running commands directly is more reliable than automation
2. **Simple Commands**: Avoid complex git operations through terminal integration
3. **Clear Instructions**: Provide exact commands with full paths
4. **Test Locally**: User can verify commands work before running them
5. **Documentation**: Keep git issues documented for future reference

## 🚫 **Things to NEVER Do Again**

- ❌ Try `git --no-pager` commands through terminal
- ❌ Attempt complex git configurations through terminal
- ❌ Use `&&` operators in PowerShell environments
- ❌ Try to "fix" git pager issues programmatically
- ❌ Assume terminal git integration will work

## ✅ **Always Remember**

**When git is needed**: Give the user manual commands to run.  
**When automation fails**: Fall back to manual instructions immediately.  
**When in doubt**: Manual method always works.

---

*Created after multiple failed attempts at terminal git integration. The manual method is the ONLY reliable approach in this environment.*
