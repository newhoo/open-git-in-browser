import * as vscode from 'vscode';
import { FileInfo, openGitInBrowser } from './util';
import * as git from './git';

export function activate(context: vscode.ExtensionContext) {
	const openGitInBrowserCommand = vscode.commands.registerCommand('open-git-in-browser.openGitInBrowser', (arg: any) => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders == undefined || workspaceFolders.length < 1) {
			vscode.window.showInformationMessage("No project was found in your workspace, open a folder and try again.");
			return
		}
		git.getGitInfo().then(gitInfos => {
			let filePath = '';
			let start = 0
			let end = 0
			let lineCount = 0
			// If command is run from the Visual Studio Code Source Control View, load the specific repo
			if (typeof arg === 'object' && arg.rootUri) {
			} else if (arg instanceof vscode.Uri) {
				const editor = vscode.window.activeTextEditor;
				if (editor && arg.path === editor.document.uri.path) {
					lineCount = editor.document.lineCount
					start = editor.selection.start.line + 1;
					end = editor.selection.end.line + 1;
				}
				filePath = arg.path;
			} else {
				const editor = vscode.window.activeTextEditor;
				if (editor) {
					lineCount = editor.document.lineCount
					start = editor.selection.start.line + 1;
					end = editor.selection.end.line + 1;
					filePath = editor.document.uri.path;
				}
			}
			if (filePath && filePath.startsWith(workspaceFolders[0].uri.path)) {
				filePath = vscode.workspace.asRelativePath(filePath);
			} else {
				filePath = ''
			}
			if (!filePath || (start == 1 && end == 1) || (start == lineCount && end == lineCount)) {
				start = 0
				end = 0
			}
			openGitInBrowser(gitInfos, new FileInfo(filePath, start, end))
		}).catch(e => {
			vscode.window.showInformationMessage("Could not find git info or recognize the remote web platform.");
		});
	});

	context.subscriptions.push(openGitInBrowserCommand);
}

export function deactivate() { }
