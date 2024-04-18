import * as vscode from 'vscode';
import { log } from './util';
import  { simpleGit, SimpleGit, CleanOptions } from 'simple-git';
import GitUrlParse from 'git-url-parse';

export class GitInfo {
    remoteName: string
    url: UrlParsed
    commitHash: string
    branch: string
    constructor(remoteName: string, url: UrlParsed, commitHash: string, branch: string) {
        this.remoteName = remoteName;
        this.url = url;
        this.commitHash = commitHash;
        this.branch = branch;
    }
}

export class UrlParsed {
    protocol: string
    host: string
    pathname: string
    constructor(protocol: string, host: string, pathname: string) {
        this.protocol = protocol;
        this.host = host;
        this.pathname = pathname;
    }
}

export async function getGitInfo(): Promise<GitInfo[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders === undefined || workspaceFolders.length < 1) {
        log('No workspace folders found');
        return [];
    }
    const folderPath = workspaceFolders[0].uri.fsPath;
    const git: SimpleGit = simpleGit(folderPath).clean(CleanOptions.FORCE);

    const remotes = await git.getRemotes(true);
    if (remotes.length < 1) {
        return [];
    }

    const gitInfos: GitInfo[] = []
    for (let index = 0; index < remotes.length; index++) {
        const remote = remotes[index];
        const remoteUrl = remote.refs.fetch;
        const commitHash = await git.revparse(['HEAD']);
        const branchs = await git.branch()
        let branch = ''
        for (const b in branchs.branches) {
            if (b == "remotes/origin/" + branchs.current) {
                branch = branchs.current
            }
        }

        log(`Find git: remote ${remoteUrl} and revision ${commitHash} and branch ${branch}`)
        const gitUrl = GitUrlParse(remoteUrl);
        const host = (gitUrl.port != null && gitUrl.port > 0) ? gitUrl.resource + ':' + gitUrl.port : gitUrl.resource
        const parseUrl = new UrlParsed(gitUrl.protocol, host, gitUrl.pathname)

        gitInfos.push(new GitInfo(remote.name, parseUrl, commitHash, branch));
    }

    return gitInfos;
}