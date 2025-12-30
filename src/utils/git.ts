import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export interface ChangedFile {
  file: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
}

/**
 * Get list of changed files from git diff
 * Compares against the merge base with main/master or HEAD if not on a branch
 */
export async function getChangedFiles(cwd: string): Promise<ChangedFile[]> {
  try {
    // Try to find merge base with main or master
    let base = "HEAD";
    try {
      const { stdout: mainBase } = await execAsync(
        "git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null || echo HEAD",
        { cwd }
      );
      base = mainBase.trim() || "HEAD";
    } catch {
      // Fall back to HEAD~1 if no main/master
      try {
        await execAsync("git rev-parse HEAD~1", { cwd });
        base = "HEAD~1";
      } catch {
        // Single commit repo, compare against empty tree
        base = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"; // empty tree hash
      }
    }

    const { stdout } = await execAsync(
      `git diff --numstat ${base}`,
      { cwd }
    );

    const files: ChangedFile[] = [];
    
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;
      
      const [addStr, delStr, file] = line.split("\t");
      if (!file) continue;

      // Binary files show as "-"
      const additions = addStr === "-" ? 0 : parseInt(addStr, 10);
      const deletions = delStr === "-" ? 0 : parseInt(delStr, 10);

      let status: ChangedFile["status"] = "modified";
      if (additions > 0 && deletions === 0) {
        // Check if file is truly new
        try {
          await execAsync(`git show ${base}:${file}`, { cwd });
        } catch {
          status = "added";
        }
      } else if (additions === 0 && deletions > 0) {
        status = "deleted";
      }

      files.push({ file, status, additions, deletions });
    }

    return files;
  } catch (error) {
    // Not a git repo or other error
    return [];
  }
}

/**
 * Get the content of a file at a specific git ref
 */
export async function getFileAtRef(
  cwd: string,
  file: string,
  ref: string = "HEAD"
): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`git show ${ref}:${file}`, { cwd });
    return stdout;
  } catch {
    return null;
  }
}

/**
 * Check if we're in a git repository
 */
export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    await execAsync("git rev-parse --git-dir", { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the root of the git repository
 */
export async function getGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git rev-parse --show-toplevel", { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}
