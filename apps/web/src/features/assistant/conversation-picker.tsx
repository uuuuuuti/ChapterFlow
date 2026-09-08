import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useI18n } from "../../i18n";
export function ConversationPicker({
  conversations,
  loading,
  value,
  onSelect,
}: {
  conversations: { id: string; title: string; status: string }[];
  loading: boolean;
  value: string | null;
  onSelect: (conversationId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const { t } = useI18n();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const active = conversations.filter((c) => c.status !== "archived");
  const archived = conversations.filter((c) => c.status === "archived");
  const current = conversations.find((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (id: string | null) => {
    setOpen(false);
    onSelect(id);
  };

  return (
    <span ref={rootRef} className="assistant-conv">
      <button
        type="button"
        className="assistant-conv__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={loading}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="assistant-conv__label">
          {current ? current.title : t("assistant.conversation.defaultTitle")}
        </span>
        <ChevronDown size={14} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="assistant-conv__menu"
          role="listbox"
          aria-label={t("assistant.conversation.pickerLabel")}
        >
          {active.length === 0 && archived.length === 0 ? (
            <p className="assistant-conv__empty">
              {t("assistant.conversation.empty")}
            </p>
          ) : null}
          {active.map((conversation) => (
            <button
              key={conversation.id}
              type="button"
              role="option"
              aria-selected={conversation.id === value}
              className="assistant-conv__item"
              onClick={() => choose(conversation.id)}
            >
              {conversation.title}
            </button>
          ))}
          {archived.length > 0 ? (
            <div className="assistant-conv__archived">
              <button
                type="button"
                className="assistant-conv__archived-toggle"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
              >
                {t("assistant.conversation.archivedGroup", {
                  count: archived.length,
                })}
                <ChevronDown
                  size={13}
                  strokeWidth={1.5}
                  aria-hidden="true"
                  style={{
                    transform: showArchived ? "rotate(180deg)" : undefined,
                  }}
                />
              </button>
              {showArchived
                ? archived.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      role="option"
                      aria-selected={conversation.id === value}
                      className="assistant-conv__item assistant-conv__item--archived"
                      onClick={() => choose(conversation.id)}
                    >
                      {conversation.title}
                    </button>
                  ))
                : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </span>
  );
}
