import { BoardPage } from "@/components/board-page";

export default function ProjectBoard(props: { params: Promise<{ key: string }>; searchParams: Promise<{ task?: string }> }) {
  return <BoardPage {...props} view="board" />;
}
