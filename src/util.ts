import * as vscode from 'vscode';
import { EXTENSION_NAME } from './constants';
import { GitInfo, UrlParsed } from './git';

const out = vscode.window.createOutputChannel("Open Git in Browser");

export function log(msg: string) {
    out.appendLine(msg);
}

export class FileInfo {
    filePath: string
    firstLine: number
    lastLine: number
    constructor(filePath: string, firstLine: number, lastLine: number) {
        this.filePath = filePath;
        this.firstLine = firstLine;
        this.lastLine = lastLine;
    }
}

export function getEditorInfo(): FileInfo | null {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const filePath = editor.document.uri.fsPath;
        const relativeFilePath = vscode.workspace.asRelativePath(filePath);

        const start = editor.selection.start.line + 1;
        const end = editor.selection.end.line + 1;
        return new FileInfo(relativeFilePath, start, end);
    }
    return null;
}

export async function openGitInBrowser(gitInfos: GitInfo[], fileInfo: FileInfo) {
    if (!gitInfos || gitInfos.length < 1) {
        vscode.window.showInformationMessage("Could not find git info or recognize the remote web platform.");
        return
    }

    if (gitInfos.length == 1) {
        doOpen(gitInfos[0], fileInfo)
        return
    }

    const remoteNames = gitInfos.map(e => e.remoteName)
    const choice = await vscode.window.showInformationMessage("Found more than one git remote, which do you want to open?", ...remoteNames);
    for (let index = 0; index < gitInfos.length; index++) {
        const gitInfo = gitInfos[index];
        if (choice === gitInfo.remoteName) {
            doOpen(gitInfo, fileInfo)
        }
    }
}

const doOpen = (gitInfo: GitInfo, fileInfo: FileInfo) => {
    const webUrl = buildWebUrl(gitInfo.url, gitInfo.commitHash, gitInfo.branch, fileInfo)
    log("Open url: " + webUrl)
    vscode.env.openExternal(vscode.Uri.parse(webUrl));
}

function buildWebUrl(url: UrlParsed, commitHash: string, branch: string, fileInfo: FileInfo): string {
    const specialGitPlatformConfig = vscode.workspace.getConfiguration(EXTENSION_NAME)['specialGitPlatform'];
    const specialGitPlatform = specialGitPlatformConfig[url.host];

    if (specialGitPlatform === "AzureDevOps") {
        return azureDevopsUrlToWebUrl(url, commitHash, fileInfo);
    } else if (specialGitPlatform === "stash") {
        return stashUrlToWebUrl(url, commitHash, fileInfo);
    }

    if (url.host.endsWith('azure.com')) {
        return azureDevopsUrlToWebUrl(url, commitHash, fileInfo);
    } else if (url.host.endsWith('stash.com')) {
        return stashUrlToWebUrl(url, commitHash, fileInfo);
    }
    return defaultUrlToWebUrl(url, commitHash, branch, fileInfo)
}

function defaultUrlToWebUrl(giturl: UrlParsed, commitHash: string, branch: string, fileInfo: FileInfo): string {
    const trimmedPath = giturl.pathname.replace(/.git$/, '').replace(/^\//, '');

    let protocol = 'https'
    if (giturl.protocol == 'http') {
        protocol = 'http'
    }

    let webUrl = ''
    if (fileInfo) {
        const fragment = getLineNumberFragment('L', fileInfo);
        if (branch) {
            webUrl = `${protocol}://${giturl.host}/${trimmedPath}/blob/${branch}/${fileInfo.filePath}${fragment}`;
        } else {
            webUrl = `${protocol}://${giturl.host}/${trimmedPath}/blob/${commitHash}/${fileInfo.filePath}${fragment}`;
        }
    } else {
        if (branch) {
            webUrl = `${protocol}://${giturl.host}/${trimmedPath}/tree/${branch}`;
        } else {
            webUrl = `${protocol}://${giturl.host}/${trimmedPath}`;
        }
    }
    return webUrl;
}

function stashUrlToWebUrl(url: UrlParsed, commitHash: string, fileInfo: FileInfo): string {
    const host = url.host;
    const trimmedPath = url.pathname.replace(/.git$/, '').replace(/^\//, '');
    const fragment = getLineNumberFragment('', fileInfo);

    const pathSplit = trimmedPath.split('/');
    if (pathSplit.length === 2) {
        const project = pathSplit[0];
        const repo = pathSplit[1];
        return `https://${host}/projects/${project}/repos/${repo}/browse/${fileInfo.filePath}?at=${commitHash}${fragment}`
    }

    return `https://${host}/${trimmedPath}/${fileInfo.filePath}?at=${commitHash}${fragment}`
}

function azureDevopsUrlToWebUrl(url: UrlParsed, commitHash: string, fileInfo: FileInfo): string {
    const adoRepo = parseAzureDevOpsRepo(url.pathname);
    // ADO's last line semantics are more like "next line" after the last line
    const lastLine = fileInfo.lastLine + 1;
    return `https://${adoRepo.subdomain}.visualstudio.com/${adoRepo.organization}/_git/${adoRepo.repo}?path=/${fileInfo.filePath}&version=GC${commitHash}&line=${fileInfo.firstLine}&lineEnd=${lastLine}&lineStartColumn=1&_a=contents`;
}

class AzureDevOpsRepo {
    subdomain: string
    organization: string
    repo: string
    constructor(subdomain: string, organization: string, repo: string) {
        this.subdomain = subdomain;
        this.organization = organization;
        this.repo = repo;
    }
}

function parseAzureDevOpsRepo(pathname: string): AzureDevOpsRepo {
    const trimmedPath = pathname.replace(/.git$/, '').replace(/^\//, '');
    const pathSplit = trimmedPath.split("/");
    if (pathSplit.length != 4) {
        throw new Error(`expected 4 slash-separated parts in ${trimmedPath}`);
    }
    return new AzureDevOpsRepo(pathSplit[1], pathSplit[2], pathSplit[3]);
}

function getLineNumberFragment(prefix: string, fileInfo: FileInfo): string {
    if (fileInfo.firstLine < 1 || fileInfo.lastLine < 1) {
        return ""
    }
    if (fileInfo.firstLine === fileInfo.lastLine) {
        return `#${prefix}${fileInfo.firstLine}`;
    }
    return `#${prefix}${fileInfo.firstLine}-${prefix}${fileInfo.lastLine}`;
}