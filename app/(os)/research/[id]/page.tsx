import { ResearchScreen } from "@/components/screens/research";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResearchScreen id={id} />;
}
