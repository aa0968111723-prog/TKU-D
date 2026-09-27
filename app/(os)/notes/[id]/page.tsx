import { NoteScreen } from "@/components/screens/study";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NoteScreen id={id} />;
}
