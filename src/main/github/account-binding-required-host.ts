import {
  isUnresolvedSshHostAlias,
  foldComparableGitHubHost
} from '../../shared/git-remote-host-alias'
import { githubHostFromIdentityKey } from '../../shared/github/repository-identity-key'
import { rawSshTransportHost, remoteUrlUsesSshTransport } from './github-remote-identity-parsing'
import {
  resolveSshConfigHostname,
  type SshConfigResolutionContext
} from './github-ssh-host-alias-resolution'

export type SshAliasHostnameResolver = (
  alias: string,
  context: SshConfigResolutionContext
) => Promise<{ hostname: string | null }>

/**
 * Host filter for Settings GitHub account binding.
 * `undefined` means do not filter.
 */
export async function resolveGhAccountRequiredHost(
  repo: {
    path: string
    connectionId?: string | null
    gitRemoteIdentity?: { canonicalKey: string; remoteUrl: string } | null
  },
  localGitOptions: { wslDistro?: string },
  resolveAlias: SshAliasHostnameResolver = resolveSshConfigHostname
): Promise<string | undefined> {
  const host = githubHostFromIdentityKey(repo.gitRemoteIdentity?.canonicalKey)
  const remoteUrl = repo.gitRemoteIdentity?.remoteUrl ?? ''
  // Why: OpenSSH aliases can contain dots, so every SSH host must be resolved through its config.
  if (!host || !remoteUrlUsesSshTransport(remoteUrl)) {
    return host
  }
  const context: SshConfigResolutionContext = {
    repoPath: repo.path,
    connectionId: repo.connectionId ?? null,
    ...(localGitOptions.wslDistro ? { wslDistro: localGitOptions.wslDistro } : {})
  }
  // Why raw: the canonical key is lowercased, but OpenSSH matches Host patterns case-sensitively.
  const alias = rawSshTransportHost(remoteUrl) ?? host
  const resolved = await resolveAlias(alias, context).catch(() => null)
  const hostname = resolved?.hostname?.trim().toLowerCase()
  if (!hostname || isUnresolvedSshHostAlias(hostname)) {
    // Why: remote connections cannot read SSH config, but a direct github.com host is authoritative.
    if (host === 'github.com' && alias.toLowerCase() === 'github.com') {
      return 'github.com'
    }
    return undefined
  }
  // Why: only github.com's SSH/www aliases fold; gh keys an Enterprise login by its exact host.
  return foldComparableGitHubHost(hostname) === 'github.com' ? 'github.com' : hostname
}
