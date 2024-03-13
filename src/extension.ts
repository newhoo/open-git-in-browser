import * as vscode from 'vscode';
import { existsSync } from 'fs';
import { ExtensionConfiguration, determineStatusBarAlignment, determineStatusBarIcon } from './config';
import { Commands, EXTENSION_NAME, STATUSBAR_TOOLTIP } from './constants';
import { FileInfo, getEditorInfo, openGitInBrowser, log } from './util';
import * as git from './git';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
	initializeCommands(context);
	initializeStatusBar(context);
}

const initializeCommands = (context: vscode.ExtensionContext, command = Commands.OPEN_REPOSITORY): void => {
	const openGitInBrowserCommand = vscode.commands.registerCommand(Commands.OPEN_REPOSITORY, async (arg: any) => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		if (workspaceFolders == undefined || workspaceFolders.length < 1) {
			vscode.window.showInformationMessage("No project was found in your workspace, open a folder and try again.");
			return
		}
		git.getGitInfo().then(async gitInfos => {
			let fileInfo;
			// If command is run from the Visual Studio Code Source Control View, load the specific repo
			if (typeof arg === 'object' && arg.rootUri) {
				fileInfo = null
			} else if (arg instanceof vscode.Uri) {
				const filePath = arg.path.replace(workspaceFolders[0].uri.path, "").substring(1);
				fileInfo = new FileInfo(filePath, 0, 0)
			} else {
				fileInfo = getEditorInfo()
			}
			if (fileInfo == null) {
				fileInfo = new FileInfo('', 0, 0)
			}
			openGitInBrowser(gitInfos, fileInfo)
		}).catch(e => {
			vscode.window.showInformationMessage("Could not find git info or recognize the remote web platform.");
		});
	});

	context.subscriptions.push(openGitInBrowserCommand);
};

const initializeStatusBar = (context: vscode.ExtensionContext, command = Commands.OPEN_REPOSITORY): void => {
	const extensionConfiguration = vscode.workspace.getConfiguration(EXTENSION_NAME);
	if (extensionConfiguration.get(ExtensionConfiguration.StatusBarEnabled) !== true) {
		return
	}
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (workspaceFolders == undefined || workspaceFolders.length < 1) {
		return
	}
	const gitPath = workspaceFolders[0].uri.fsPath + path.sep + ".git"
	const existsGitPath = existsSync(gitPath);
	log(`Exist git path: ${gitPath} => ${existsGitPath}`)
	if (!existsGitPath) {
		return
	}

	const statusBarItem: vscode.StatusBarItem = vscode.window.createStatusBarItem(
		determineStatusBarAlignment(extensionConfiguration.get(ExtensionConfiguration.StatusBarAlignment)),
		100
	);

	const statusBarIcon = determineStatusBarIcon(extensionConfiguration.get(ExtensionConfiguration.StatusBarIcon));
	updateStatusBarItem(statusBarItem, statusBarIcon, STATUSBAR_TOOLTIP, command);
	context.subscriptions.push(statusBarItem);

	listenForConfigurationChanges(statusBarItem);
};

const listenForConfigurationChanges = (statusBarItem: vscode.StatusBarItem): void => {
	// Subscribe to configuration changes
	vscode.workspace.onDidChangeConfiguration((event) => {
		if (
			event.affectsConfiguration(`${EXTENSION_NAME}.${ExtensionConfiguration.StatusBarIcon}`) ||
			event.affectsConfiguration(`${EXTENSION_NAME}.${ExtensionConfiguration.StatusBarEnabled}`)
		) {
			const extensionConfiguration = vscode.workspace.getConfiguration(EXTENSION_NAME);

			const statusBarIcon = determineStatusBarIcon(extensionConfiguration.get(ExtensionConfiguration.StatusBarIcon));
			const enableStatusBarIcon = extensionConfiguration.get(ExtensionConfiguration.StatusBarEnabled) === true;

			updateStatusBarItem(
				statusBarItem,
				statusBarIcon,
				STATUSBAR_TOOLTIP,
				Commands.OPEN_REPOSITORY,
				enableStatusBarIcon
			);
		}
	});
};

const updateStatusBarItem = (
	statusBarItem: vscode.StatusBarItem,
	text: string,
	tooltip: string,
	command: Commands,
	show = true
) => {
	statusBarItem.text = `$(${text})`;
	statusBarItem.tooltip = tooltip;
	statusBarItem.command = command;
	show ? statusBarItem.show() : statusBarItem.hide();
};

export function deactivate() { }
