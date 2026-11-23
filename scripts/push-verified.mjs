#!/usr/bin/env node
// Push, then prove the push happened. Three times in this project a push loop
// reported success when nothing was pushed:
//
//   1. `git push | grep 'main -> main'` — the pipeline's exit status was tail's,
//      so a failed push looked fine;
//   2. `grep 'up-to-date'` — a commit the commit-msg hook had rejected produced
//      "up-to-date", which the loop counted as success;
//   3. `git push >/dev/null; [ $? -eq 0 ]` — git returns 0 when there is nothing
//      to push, so a blocked commit was indistinguishable from a landed one.
//
// The lesson is not "check the exit code". It is that a push is only confirmed by
// comparing the remote to the local commit, and this script does exactly that and
// nothing else. Exit 0 means: the remote default branch now points at HEAD.
//
// Usage: node scripts/push-verified.mjs [repoPath ...]
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const targets = (process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['.']).map(path => resolve(path))
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()

function gh(cwd, ...args) {
  try {
    return execFileSync('gh', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim()
  } catch (error) {
    return `GH_FAILED: ${String(error.stderr || error.message).split('\n')[0].slice(0, 120)}`
  }
}

function remoteSlug(cwd) {
  const url = git(cwd, 'remote', 'get-url', 'origin')
  const match = /github\.com[:/]([^/]+)\/([^/.]+)/.exec(url)
  // Not a GitHub remote: there is no API to ask, so fall back to ls-remote. The
  // rule is only that a push is confirmed by reading the remote, never by an exit
  // code — the mechanism can vary, the standard cannot.
  return match ? `${match[1]}/${match[2]}` : null
}

function remoteHead(cwd, slug) {
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  if (!slug) {
    try {
      const out = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }).trim()
      const sha = out.split(/\s+/)[0] ?? ''
      return /^[0-9a-f]{40}$/.test(sha) ? { ok: true, sha, branch } : { ok: false, sha: null, branch }
    } catch {
      return { ok: false, sha: null, branch }
    }
  }
  // git ls-remote needs the same flaky github.com:443 that the push needs, so the
  // API is the confirmation channel here. A failed API call is "unknown", never
  // "done".
  const sha = gh(cwd, 'api', `repos/${slug}/commits/${branch}`, '--jq', '.sha')
  if (sha.startsWith('GH_FAILED') || !/^[0-9a-f]{40}$/.test(sha)) return { ok: false, sha: null, branch }
  return { ok: true, sha, branch }
}

let failures = 0
for (const cwd of targets) {
  const slug = remoteSlug(cwd)
  const label = slug ?? cwd
  const branch = git(cwd, 'rev-parse', '--abbrev-ref', 'HEAD')
  const local = git(cwd, 'rev-parse', 'HEAD')
  const dirty = git(cwd, 'status', '--porcelain')

  if (dirty) {
    process.stdout.write(`${label}: uncommitted changes present — they will not be pushed\n`)
  }

  const before = remoteHead(cwd, slug)
  if (before.ok && before.sha === local) {
    process.stdout.write(`${label}: already up to date at ${local.slice(0, 7)} (nothing to push, and that is verified, not assumed)\n`)
    continue
  }

  let pushed = false
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      execFileSync('git', ['push', 'origin', 'HEAD'], { cwd, encoding: 'utf8', stdio: 'pipe' })
      pushed = true
      break
    } catch (error) {
      const first = String(error.stderr || error.message).split('\n').filter(Boolean)[0] ?? 'unknown'
      process.stdout.write(`${label}: push attempt ${attempt} failed — ${first.slice(0, 100)}\n`)
      // Three kinds of failure, only one of them worth retrying:
      //   network (443, HTTP2, timeout) — the network flaps here constantly, retry;
      //   a rejected commit-msg hook — the commit never existed, retrying is pointless;
      //   non-fast-forward — the remote moved, no amount of retrying will help.
      const entire = String(error.stderr || error.message)
      if (/commit-msg|hook/i.test(first) || /rejected|non-fast-forward|fetch first|failed to push some refs/i.test(entire)) break
      // 退避秒数可以关掉，只为让「推不上去」这条路径进得了测试：真跑一遍六次退避要 75 秒，
      // 而这条路径恰恰是本项目踩过三次的地方（循环报告成功、实际什么都没推上去）。
      execFileSync('sleep', [String(Number(process.env.PUSH_VERIFIED_SLEEP ?? attempt * 5))])
    }
  }

  const after = remoteHead(cwd, slug)
  const landed = after.ok && after.sha === local
  if (landed) {
    process.stdout.write(`${label}: confirmed ${branch} at ${local.slice(0, 7)}${pushed ? '' : ' (was already there)'}\n`)
  } else {
    failures += 1
    const detail = after.ok ? `remote is ${after.sha.slice(0, 7)}, local is ${local.slice(0, 7)}` : 'remote could not be read'
    process.stdout.write(`${label}: NOT confirmed — ${detail}\n`)
  }
}

process.exit(failures === 0 ? 0 : 1)