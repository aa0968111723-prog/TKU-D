import { PaperScreen } from "@/components/screens/papers";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PaperScreen id={id} />;
}
