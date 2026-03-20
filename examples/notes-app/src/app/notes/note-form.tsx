import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface NoteFormProps {
  title: string;
  content: string;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  idPrefix: string;
}

export function NoteForm({
  title,
  content,
  onTitleChange,
  onContentChange,
  onSubmit,
  onCancel,
  submitLabel,
  idPrefix,
}: NoteFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-title`}>Title</Label>
        <Input
          id={`${idPrefix}-title`}
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Note title"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-content`}>Content</Label>
        <Textarea
          id={`${idPrefix}-content`}
          value={content}
          onChange={(e) => onContentChange(e.target.value)}
          placeholder="Note content (optional)"
          rows={4}
        />
      </div>
      <div className="flex gap-2">
        <Button onClick={onSubmit}>{submitLabel}</Button>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
