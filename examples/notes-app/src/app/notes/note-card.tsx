import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NoteForm } from "./note-form";
import type { Note } from "./types";

interface NoteCardProps {
  note: Note;
  isEditing: boolean;
  editTitle: string;
  editContent: string;
  onEditTitleChange: (value: string) => void;
  onEditContentChange: (value: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function NoteCard({
  note,
  isEditing,
  editTitle,
  editContent,
  onEditTitleChange,
  onEditContentChange,
  onSave,
  onCancel,
  onEdit,
  onDelete,
}: NoteCardProps) {
  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <NoteForm
            title={editTitle}
            content={editContent}
            onTitleChange={onEditTitleChange}
            onContentChange={onEditContentChange}
            onSubmit={onSave}
            onCancel={onCancel}
            submitLabel="Save"
            idPrefix={`edit-${note.id}`}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{note.title}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {note.content ? (
          <p className="text-gray-600 whitespace-pre-wrap">{note.content}</p>
        ) : (
          <p className="text-gray-400 italic">No content</p>
        )}
        <p className="text-xs text-gray-400 mt-2">
          Updated {new Date(note.updated_at).toLocaleString()}
        </p>
      </CardContent>
    </Card>
  );
}
