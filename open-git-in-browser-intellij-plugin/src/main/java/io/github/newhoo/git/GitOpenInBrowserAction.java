package io.github.newhoo.git;

import com.intellij.ide.BrowserUtil;
import com.intellij.notification.Notification;
import com.intellij.notification.NotificationAction;
import com.intellij.openapi.actionSystem.*;
import com.intellij.openapi.editor.Editor;
import com.intellij.openapi.editor.SelectionModel;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.project.DumbAwareAction;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.popup.JBPopupFactory;
import com.intellij.openapi.ui.popup.ListPopup;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.openapi.vcs.changes.Change;
import com.intellij.openapi.vcs.changes.ChangeListManager;
import com.intellij.openapi.vfs.VirtualFile;
import git4idea.GitLocalBranch;
import git4idea.GitRemoteBranch;
import git4idea.GitUtil;
import git4idea.repo.GitRemote;
import git4idea.repo.GitRepository;
import git4idea.repo.GitRepositoryManager;
import io.github.newhoo.git.util.NotificationUtils;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

import java.awt.datatransfer.StringSelection;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

/**
 * OpenInBrowserAction
 *
 * @author huzunrong
 * @since 1.0
 */
public class GitOpenInBrowserAction extends DumbAwareAction {

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }

    @Override
    public void update(final AnActionEvent e) {
        Project project = e.getData(PlatformDataKeys.PROJECT);
        if (project == null || project.isDefault()) {
            setVisibleEnabled(e, false, false);
            return;
        }

        final Collection<GitRepository> repositories = GitUtil.getRepositories(project);
        // 找不到git仓库信息
        if (repositories.isEmpty()) {
            setVisibleEnabled(e, false, false);
            return;
        }

        // 未选择文件，取git仓库地址
        VirtualFile virtualFile = e.getData(PlatformDataKeys.VIRTUAL_FILE);
        if (virtualFile == null) {
            setVisibleEnabled(e, true, true);
            return;
        }

        ChangeListManager changeListManager = ChangeListManager.getInstance(project);
        if (changeListManager.isUnversioned(virtualFile)) {
            setVisibleEnabled(e, true, false);
            return;
        }

        Change change = changeListManager.getChange(virtualFile);
        if (change != null && (change.getType() == Change.Type.NEW)) {
            setVisibleEnabled(e, true, false);
            return;
        }
    }

    @Override
//    @CalledInBackground
    public void actionPerformed(final AnActionEvent e) {
        final Project project = e.getData(PlatformDataKeys.PROJECT);
        final VirtualFile virtualFile = e.getData(PlatformDataKeys.VIRTUAL_FILE);
        final Editor editor = e.getData(PlatformDataKeys.EDITOR);
        if (project == null || project.isDisposed()) {
            return;
        }

        GitRepository repository;

        // 未选择文件，取第一个git仓库地址
        if (virtualFile == null) {
            Optional<GitRepository> firstRepo = GitUtil.getRepositories(project).stream().findFirst();
            if (!firstRepo.isPresent()) {
                return;
            }
            repository = firstRepo.get();
        } else {
            GitRepositoryManager manager = GitUtil.getRepositoryManager(project);
            repository = manager.getRepositoryForFileQuick(virtualFile);
            if (repository == null) {
                StringBuilder details = new StringBuilder("file: " + virtualFile.getPresentableUrl() + "; Git repositories: ");
                for (GitRepository repo : manager.getRepositories()) {
                    details.append(repo.getPresentableUrl()).append("; ");
                }
                NotificationUtils.errorBalloon("", "Can't find git repository: " + details.toString(), null, project);
                return;
            }
        }

        final String rootPath = repository.getRoot().getPath();
        final String path = virtualFile != null ? virtualFile.getPath() : rootPath;

        List<AnAction> remoteSelectedActions = new ArrayList<>();

        for (GitRemote remote : repository.getRemotes()) {
            remoteSelectedActions.add(new RemoteSelectedAction(project, repository, editor, remote, rootPath, path));
        }

        if (remoteSelectedActions.size() > 1) {
            DefaultActionGroup remotesActionGroup = new DefaultActionGroup();
            remotesActionGroup.addAll(remoteSelectedActions);
            DataContext dataContext = e.getDataContext();
            final ListPopup popup = JBPopupFactory.getInstance()
                    .createActionGroupPopup(
                            "Select Remote",
                            remotesActionGroup,
                            dataContext,
                            JBPopupFactory.ActionSelectionAid.SPEEDSEARCH,
                            true);

            popup.showInBestPositionFor(dataContext);
        } else if (remoteSelectedActions.size() == 1) {
            remoteSelectedActions.get(0).actionPerformed(e);
        } else {
            NotificationUtils.errorBalloon("", "Can't find git remote", null, project);
        }
    }

    private void setVisibleEnabled(AnActionEvent e, boolean visible, boolean enabled) {
        e.getPresentation().setVisible(visible);
        e.getPresentation().setEnabled(enabled);
    }
}

class RemoteSelectedAction extends AnAction {

    private final Editor editor;

    private final GitRemote remote;

    private final String rootPath;

    private final String path;

    private final Project project;

    private final GitRepository repository;

    public RemoteSelectedAction(@NotNull Project project, @NotNull GitRepository repository, @Nullable Editor editor,
                                @NotNull GitRemote remote, @NotNull String rootPath, @NotNull String path) {
        super(remote.getName());
        this.project = project;
        this.repository = repository;
        this.editor = editor;
        this.remote = remote;
        this.rootPath = rootPath;
        this.path = path;
    }

    @Override
    public @NotNull ActionUpdateThread getActionUpdateThread() {
        return ActionUpdateThread.BGT;
    }

    @Override
    public void actionPerformed(@Nullable AnActionEvent anActionEvent) {
        if (!path.startsWith(rootPath)) {
            NotificationUtils.errorBalloon("", "File is not under repository root: " + rootPath + ", file: " + path, null, project);
            return;
        }

        String remoteUrl = remote.getFirstUrl();

        if (remoteUrl == null) {
            NotificationUtils.errorBalloon("", "Can't obtain url for remote: " + remote.getName(), null, project);
            return;
        }

        String branch = getBranchNameOnRemote(this.project, repository);
        if (branch == null) {
            NotificationUtils.errorBalloon("", "Can't find remote tracked branch.", new NotificationAction("Open default branch") {

                @Override
                public void actionPerformed(@NotNull AnActionEvent e, @NotNull Notification notification) {
                    if (!notification.isExpired()) {
                        BrowserUtil.browse(makeRepoUrlFromRemoteUrl(remoteUrl));
                        notification.expire();
                    }
                }
            }, project);
            return;
        }

        String relativePath = path.substring(rootPath.length());
        String urlToOpen = makeUrlToOpen(editor, relativePath, branch, remoteUrl);
        if (urlToOpen.isEmpty()) {
            NotificationUtils.errorBalloon("", "Can't create properly url: " + remote.getFirstUrl(), null, project);
            return;
        }

        CopyPasteManager.getInstance().setContents(new StringSelection(urlToOpen));
        BrowserUtil.browse(urlToOpen);
    }

    private static String makeRepoUrlFromRemoteUrl(@NotNull String remoteUrl) {
        String cleanedFromDotGit = StringUtil.trimEnd(remoteUrl, ".git");

        if (remoteUrl.startsWith("http://") || remoteUrl.startsWith("https://")) {
            return cleanedFromDotGit;
        } else if (remoteUrl.startsWith("git@")) {
            String cleanedFromGitAt = StringUtil.trimStart(cleanedFromDotGit, "git@");

            return "http://" + StringUtil.replace(cleanedFromGitAt, ":", "/");
        } else {
            throw new IllegalStateException("Invalid remote Gitlab url: " + remoteUrl);
        }
    }

    public static String makeUrlToOpen(@Nullable Editor editor,
                                       @NotNull String relativePath,
                                       @NotNull String branch,
                                       @NotNull String remoteUrl) {
        final StringBuilder builder = new StringBuilder();
        final String repoUrl = makeRepoUrlFromRemoteUrl(remoteUrl);

        builder.append(repoUrl).append("/blob/").append(branch).append(relativePath);

        if (editor != null && editor.getDocument().getLineCount() >= 1) {
            // lines are counted internally from 0, but from 1 on gitlab
            SelectionModel selectionModel = editor.getSelectionModel();
            final int begin = editor.getDocument().getLineNumber(selectionModel.getSelectionStart()) + 1;
            final int selectionEnd = selectionModel.getSelectionEnd();
            int end = editor.getDocument().getLineNumber(selectionEnd) + 1;
            if (editor.getDocument().getLineStartOffset(end - 1) == selectionEnd) {
                end -= 1;
            }
            builder.append("#L").append(begin).append('-').append(end);
        }

        return builder.toString();
    }

    @Nullable
    private static String getBranchNameOnRemote(@NotNull Project project, @NotNull GitRepository repository) {
        GitLocalBranch currentBranch = repository.getCurrentBranch();
        if (currentBranch == null) {
//            NotificationUtils.errorBalloon(project, "", "Can't open the file on Git when repository is on detached HEAD. Please checkout a branch.");
            return null;
        }

        GitRemoteBranch tracked = currentBranch.findTrackedBranch(repository);
        if (tracked == null) {
//            NotificationUtils.errorBalloon(project, "",
//                    "Can't open the file on Git when current branch doesn't have a tracked branch." +
//                            "Current branch: " + currentBranch + ", tracked info: " + repository.getBranchTrackInfos());
            return null;
        }

        return tracked.getNameForRemoteOperations();
    }

    public static String link(String name, String text) {
        return "<a href=\"" + name + "\">" + text + "</a>";
    }
}
