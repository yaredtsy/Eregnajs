import type { Message, MessagePart } from "../../types/conversation";
import { useWidget } from "../../store/widget-context";
import { WalkthroughCard } from "./WalkthroughCard";

function Part({
  part,
  isActiveWt,
}: {
  part: MessagePart;
  isActiveWt: boolean;
}) {
  if (part.type === "text") {
    return <p className="eregna-msg__text">{part.text}</p>;
  }
  return <WalkthroughCard wt={part} isActive={isActiveWt} />;
}

function MessageBubble({ message }: { message: Message }) {
  const { state } = useWidget();
  const isUser = message.role === "user";

  return (
    <div
      className={`eregna-msg ${isUser ? "eregna-msg--user" : "eregna-msg--assistant"}`}
    >
      {!isUser && (
        <div className="eregna-msg__avatar" aria-hidden>
          E
        </div>
      )}
      <div className="eregna-msg__content">
        {message.parts.map((part, i) => (
          <Part
            key={i}
            part={part}
            isActiveWt={
              part.type === "walkthrough" &&
              part.walkthroughId === state.activeWalkthroughId
            }
          />
        ))}
        {message.metadata?.stopped && (
          <p className="eregna-msg__stopped">Response stopped</p>
        )}
      </div>
    </div>
  );
}

export function MessageList() {
  const { state } = useWidget();
  return (
    <div className="eregna-msg-list">
      {state.conversation.messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
    </div>
  );
}
