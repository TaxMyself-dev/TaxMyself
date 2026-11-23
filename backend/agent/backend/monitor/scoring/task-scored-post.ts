/**
 * What the monitor's scoring, repeat check and match descriptions read of
 * an item (task-post-scoring.ts, task-match-repeats.ts,
 * task-match-description.ts): its text, when it was written, who wrote it,
 * and its replies, any of which may be the match. task-source-scan.ts makes
 * one from each TaskItem.
 */
export interface TaskScoredPost {
  // `<source>|<item id>`: two sources may share an item id.
  id: string;
  text: string | null;
  createdAt: string | null;
  authorId: string | null;
  attachments: readonly { title: string | null; description: string | null }[];
  comments: readonly {
    id: string;
    text: string | null;
    createdAt: string | null;
    authorId: string | null;
  }[];
}
