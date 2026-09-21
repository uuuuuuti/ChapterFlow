import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

type HeaderActionProps = PropsRuntime<'conversation.session.header.actions'>

function ChapterFlowSpikeBadge({ useSession }: HeaderActionProps) {
  const running = useSession((snapshot) => snapshot.running)
  return (
    <div
      title="ChapterFlow DeepSeek Harness Adapter Spike"
      style={{
        alignItems: 'center',
        border: '1px solid var(--border-subtle, rgba(127,127,127,.25))',
        borderRadius: 999,
        display: 'inline-flex',
        fontSize: 12,
        fontWeight: 600,
        gap: 6,
        lineHeight: 1,
        padding: '7px 10px',
        whiteSpace: 'nowrap',
      }}
    >
      <span aria-hidden="true">{running ? '●' : '✓'}</span>
      <span>ChapterFlow</span>
      <span style={{ opacity: 0.65 }}>{running ? 'Agent 运行中' : 'Spike Ready'}</span>
    </div>
  )
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      {
        name: 'conversation.session.header.actions',
        id: 'chapterflow-adapter-spike',
        order: 80,
      },
      ChapterFlowSpikeBadge,
    ),
  )
}
