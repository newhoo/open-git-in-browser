package io.github.newhoo.git.util;

import com.intellij.notification.*;
import com.intellij.openapi.project.Project;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * NotificationUtils
 *
 * @author huzunrong
 * @since 1.0
 */
public class NotificationUtils {
    private static final NotificationGroup balloonGroup = NotificationGroupManager.getInstance().getNotificationGroup("git-open-notification");

    public static void errorBalloon(@NotNull String title, @NotNull String msg, @Nullable NotificationAction action, @NotNull Project project) {
        notify(title, msg, NotificationType.ERROR, action, project);
    }

    private static void notify(@NotNull String title,
                               @NotNull String message,
                               @NotNull NotificationType type,
                               @Nullable NotificationAction action,
                               @NotNull Project project) {
        Notification notification = balloonGroup.createNotification(message, type);
        notification.setTitle(title);
        if (action != null) {
            notification.addAction(action);
        }
        notification.notify(project);
    }
}