import { ActionPanel, Action, Icon, List } from "@raycast/api";
import { useCachedState } from "@raycast/utils";

interface Todo {
  id: string;
  title: string;
  isCompleted: boolean;
}

function defaultItems(): Todo[] {
  return [
    { id: "1", title: "Install brew", isCompleted: false },
    { id: "2", title: "Install LibreOffice", isCompleted: false },
    { id: "3", title: "Convert your first Slides to PDF!", isCompleted: false },
  ];
}

export default function Command() {
  const [items, setItems] = useCachedState<Todo[]>("todos", defaultItems());

  const completed = items.filter((t) => t.isCompleted).length;
  const pct = items.length ? completed / items.length : 0;

  function toggle(id: string) {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isCompleted: !t.isCompleted } : t))
    );
  }

  return (
    <List>
      {/* Todos */}
      {items.map((todo) => (
        <List.Item
          key={todo.id}
          title={todo.title}
          accessories={[{ icon: todo.isCompleted ? Icon.Checkmark : Icon.Circle }]}
          actions={
            <ActionPanel>
              <Action
                icon={todo.isCompleted ? Icon.Circle : Icon.Checkmark}
                title={todo.isCompleted ? "Uncomplete Todo" : "Complete Todo"}
                onAction={() => toggle(todo.id)}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
