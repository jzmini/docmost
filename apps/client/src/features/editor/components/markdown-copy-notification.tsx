import { useEffect } from "react";
import { notifications } from "@mantine/notifications";
import { IconMarkdown, IconCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

export function useMarkdownCopyNotification() {
  const { t } = useTranslation();

  useEffect(() => {
    const handleMarkdownCopied = (event: CustomEvent) => {
      notifications.show({
        title: t("Markdown Copied"),
        message: t("Selected content has been copied as Markdown"),
        color: "teal",
        icon: <IconCheck size={16} />,
        autoClose: 2000,
      });
    };

    document.addEventListener("markdownCopied", handleMarkdownCopied as EventListener);

    return () => {
      document.removeEventListener("markdownCopied", handleMarkdownCopied as EventListener);
    };
  }, [t]);

  return null;
}

export function MarkdownCopyInfo() {
  const { t } = useTranslation();
  
  return (
    <div style={{ 
      padding: "8px 12px", 
      background: "var(--mantine-color-gray-light)",
      borderRadius: "4px",
      fontSize: "12px",
      color: "var(--mantine-color-dimmed)",
      display: "flex",
      alignItems: "center",
      gap: "6px"
    }}>
      <IconMarkdown size={14} />
      <span>
        {t("Tip: Use Ctrl+Shift+C (or Cmd+Shift+C on Mac) to copy selected text as Markdown")}
      </span>
    </div>
  );
}




