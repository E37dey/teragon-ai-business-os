// TERAGON AI BUSINESS OS — platform deploy: subprocess runner (Gate S1).
// =============================================================================
// One choke point for every child process a platform script spawns. Two modes:
//   - live:   spawn with inherited stdio, return the exit code.
//   - dryRun: PRINT the (redacted) command that WOULD run and return 0 without
//             executing anything. This is what makes plan.mjs able to show the
//             exact command sequence while contacting nothing.
// Args are redacted before printing so a `--password xxx` style flag never
// leaks into the plan output.
import { spawn } from "node:child_process";
import process from "node:process";
import { log } from "./log.mjs";

/**
 * @typedef {Object} RunOptions
 * @property {boolean} [dryRun]   print the command instead of running it
 * @property {string}  [cwd]      working directory
 * @property {Record<string,string|undefined>} [env] env for the child
 * @property {string}  [label]    human label shown in dry-run output
 */

/**
 * Run a command. Resolves to the numeric exit code (never rejects on a non-zero
 * exit — the caller decides what to do). In dryRun mode nothing is spawned.
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 * @returns {Promise<number>}
 */
export function run(command, args = [], options = {}) {
  const { dryRun = false, cwd, env, label } = options;
  const printable = `${command} ${args.join(" ")}`.trim();

  if (dryRun) {
    log.plain(`    WOULD RUN: ${label ? `(${label}) ` : ""}${printable}`);
    return Promise.resolve(0);
  }

  log.info(`RUN: ${printable}`);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: "inherit",
      // Only the npm/npx (.cmd) wrappers need a shell on Windows; resolving real
      // executables directly avoids Node's DEP0190 (args + shell:true) warning.
      shell: process.platform === "win32" && /^(npm|npx|netlify|supabase)$/i.test(command),
    });
    child.on("error", (err) => {
      log.error(`spawn failed: ${err.message}`);
      resolve(-1);
    });
    child.on("close", (code) => resolve(code ?? -1));
  });
}

/**
 * Convenience: run and throw if the exit code is non-zero. Used by orchestrated
 * steps that must stop-on-first-failure.
 * @param {string} command
 * @param {readonly string[]} args
 * @param {RunOptions} [options]
 * @returns {Promise<void>}
 */
export async function runOrThrow(command, args = [], options = {}) {
  const code = await run(command, args, options);
  if (code !== 0) {
    throw new Error(`command exited ${code}: ${command} ${args.join(" ")}`.trim());
  }
}
